import type { AnalogInputEvent, DigitalInputEvent, LogicalButtonId } from './logical-input'
/**
 * A framework-free bridge from a physical gamepad (USB or Bluetooth, read via
 * the W3C Gamepad API) to the SAME logical-input events the touch controls emit.
 * A consumer wires `onInput`/`onAxis` exactly as it wires a touch control's
 * `@input`/`@axis`, so a plugged-in pad and a thumb are interchangeable.
 *
 * The mapping (physical index -> logical id) is plain data, merged over a
 * default Standard-Gamepad table and overridable live, so a remap takes effect
 * with no restart. The bridge owns only the polling loop; the diff math lives in
 * the pure {@link foldGamepad}. SSR-safe: it no-ops where `navigator`/`window`
 * are absent.
 */
import { type GamepadMapping, type GamepadSnapshot, foldGamepad } from './math'

export type { GamepadMapping } from './math'

/**
 * The W3C "Standard Gamepad" button/axis layout mapped to Doot logical ids.
 * Button indices per the spec: 0 south, 1 east, 2 west, 3 north, 4 L1, 5 R1,
 * 6 L2, 7 R2, 8 select, 9 start, 10 L3, 11 R3, 12 up, 13 down, 14 left,
 * 15 right, 16 home. Logical ids only; a consumer maps them to its target.
 */
export const STANDARD_GAMEPAD_MAPPING: GamepadMapping = {
  buttons: {
    0: 'a',
    1: 'b',
    2: 'x',
    3: 'y',
    4: 'l',
    5: 'r',
    6: 'l2',
    7: 'r2',
    8: 'select',
    9: 'start',
    10: 'l3',
    11: 'r3',
    12: 'up',
    13: 'down',
    14: 'left',
    15: 'right',
    16: 'home',
  },
  axes: { left: [0, 1], right: [2, 3] },
  deadzone: 0.12,
}

/** Injection points so the bridge is testable and SSR-safe. Defaults to globals. */
export interface GamepadEnv {
  getGamepads?: () => Array<Gamepad | null>
  requestAnimationFrame?: (cb: () => void) => number
  cancelAnimationFrame?: (handle: number) => void
  addEventListener?: (type: string, listener: (e: Event) => void) => void
  removeEventListener?: (type: string, listener: (e: Event) => void) => void
}

export interface GamepadBridgeOptions {
  /** Merged over {@link STANDARD_GAMEPAD_MAPPING}. */
  mapping?: Partial<GamepadMapping>
  onInput: (e: DigitalInputEvent) => void
  onAxis: (e: AnalogInputEvent) => void
  onConnect?: (info: { index: number; id: string }) => void
  onDisconnect?: (info: { index: number }) => void
  /** Which navigator gamepad slot to read; defaults to the first connected. */
  padIndex?: number | null
  /** Override the runtime environment (tests, SSR). */
  env?: GamepadEnv
}

export interface GamepadBridge {
  /** Attach listeners and begin the rAF poll loop. Idempotent. */
  start(): void
  /** Detach and cancel the loop. Idempotent. */
  stop(): void
  /** Merge a remap over the current mapping; effective next frame. */
  setMapping(m: Partial<GamepadMapping>): void
  /** Whether a gamepad is currently being read. */
  isConnected(): boolean
}

function mergeMapping(base: GamepadMapping, over?: Partial<GamepadMapping>): GamepadMapping {
  if (!over) return base
  return {
    buttons: { ...base.buttons, ...(over.buttons ?? {}) },
    axes: { ...base.axes, ...(over.axes ?? {}) },
    deadzone: over.deadzone ?? base.deadzone,
  }
}

function snapshot(gp: Gamepad): GamepadSnapshot {
  return {
    // Honor `pressed`, not just `value`: some controllers report a digital
    // button as { pressed: true, value: 0 } (value only matters for analog
    // triggers), and a value-only read would never register the press.
    buttons: gp.buttons.map((b) => (typeof b === 'object' ? (b.pressed ? 1 : b.value) : Number(b))),
    axes: [...gp.axes],
  }
}

function resolveEnv(env?: GamepadEnv): Required<GamepadEnv> | null {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const win = typeof window !== 'undefined' ? window : undefined
  const getGamepads =
    env?.getGamepads ?? (nav?.getGamepads ? () => [...nav.getGamepads()] : undefined)
  const raf = env?.requestAnimationFrame ?? win?.requestAnimationFrame?.bind(win)
  const caf = env?.cancelAnimationFrame ?? win?.cancelAnimationFrame?.bind(win)
  const add: GamepadEnv['addEventListener'] =
    env?.addEventListener ??
    (win ? (t, l) => win.addEventListener(t, l as EventListener) : undefined)
  const remove: GamepadEnv['removeEventListener'] =
    env?.removeEventListener ??
    (win ? (t, l) => win.removeEventListener(t, l as EventListener) : undefined)
  if (!getGamepads || !raf || !caf || !add || !remove) return null
  return {
    getGamepads,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    addEventListener: add,
    removeEventListener: remove,
  }
}

/**
 * Create a gamepad bridge. Returns a no-op bridge (start/stop do nothing) when
 * the environment has no Gamepad API, so it is always safe to construct.
 */
export function createGamepadBridge(opts: GamepadBridgeOptions): GamepadBridge {
  const env = resolveEnv(opts.env)
  if (!env) {
    return { start() {}, stop() {}, setMapping() {}, isConnected: () => false }
  }

  let mapping = mergeMapping(STANDARD_GAMEPAD_MAPPING, opts.mapping)
  let running = false
  let rafHandle: number | null = null
  let prev: GamepadSnapshot | null = null
  let activeIndex: number | null = opts.padIndex ?? null

  const pickPad = (): Gamepad | null => {
    const pads = env.getGamepads()
    // Ignore stale slots: getGamepads() can return entries with connected===false
    // after a disconnect on some browsers.
    if (activeIndex != null) {
      const p = pads[activeIndex]
      return p?.connected ? p : null
    }
    for (const p of pads) if (p?.connected) return p
    return null
  }

  const tick = () => {
    if (!running) return
    const gp = pickPad()
    if (gp) {
      if (activeIndex == null) activeIndex = gp.index
      const curr = snapshot(gp)
      const { digital, analog } = foldGamepad(prev, curr, mapping)
      for (const e of digital) opts.onInput(e)
      for (const e of analog) opts.onAxis(e)
      prev = curr
    } else {
      prev = null
    }
    rafHandle = env.requestAnimationFrame(tick)
  }

  const onConnected = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad
    if (activeIndex == null) activeIndex = gp.index
    opts.onConnect?.({ index: gp.index, id: gp.id })
  }
  const onDisconnected = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad
    if (gp.index === activeIndex) {
      activeIndex = opts.padIndex ?? null
      prev = null
    }
    opts.onDisconnect?.({ index: gp.index })
  }

  return {
    start() {
      if (running) return
      running = true
      env.addEventListener('gamepadconnected', onConnected)
      env.addEventListener('gamepaddisconnected', onDisconnected)
      // Pick up a pad already connected before start().
      const existing = pickPad()
      if (existing) {
        if (activeIndex == null) activeIndex = existing.index
        opts.onConnect?.({ index: existing.index, id: existing.id })
      }
      rafHandle = env.requestAnimationFrame(tick)
    },
    stop() {
      if (!running) return
      running = false
      if (rafHandle != null) env.cancelAnimationFrame(rafHandle)
      rafHandle = null
      prev = null
      env.removeEventListener('gamepadconnected', onConnected)
      env.removeEventListener('gamepaddisconnected', onDisconnected)
    },
    setMapping(m: Partial<GamepadMapping>) {
      mapping = mergeMapping(mapping, m)
      // Re-evaluate from a clean baseline so the new mapping takes effect without
      // a stale logical id stranded "pressed" under the old one. (Remap happens
      // between holds in practice, so this does not strip a live press.)
      prev = null
    },
    isConnected() {
      return pickPad() != null
    },
  }
}

/** Re-export so a consumer can type its own logical ids against the same alias. */
export type { LogicalButtonId }
