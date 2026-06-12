/**
 * Pure, DOM-free math for the controller kit. Everything here is unit-tested in
 * `math.test.ts`. The components and the gamepad bridge delegate their geometry
 * and edge-detection to these functions so the behaviour is provable in node.
 */
import type {
  AnalogInputEvent,
  AxisSide,
  DigitalInputEvent,
  LogicalButtonId,
} from './logical-input'

/** A normalized pointer offset from a control's center: +x right, +y DOWN (screen). */
export interface DpadDirections {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

/**
 * Which d-pad directions are active for a normalized pointer offset (each axis
 * roughly -1..1, +y pointing DOWN as in screen coordinates). A direction turns
 * on only past `threshold` (strict `>`), so the dead band at the center keeps a
 * resting thumb from firing. With `diagonals: false`, only the dominant axis
 * wins, so the pad behaves like a 4-way (no diagonal presses).
 */
export function dpadDirections(
  nx: number,
  ny: number,
  threshold: number,
  diagonals = true,
): DpadDirections {
  const out: DpadDirections = { up: false, down: false, left: false, right: false }
  const horizontal = Math.abs(nx) > threshold
  const vertical = Math.abs(ny) > threshold
  if (diagonals) {
    out.left = nx < -threshold
    out.right = nx > threshold
    out.up = ny < -threshold
    out.down = ny > threshold
    return out
  }
  // 4-way: only the stronger axis registers.
  if (horizontal && Math.abs(nx) >= Math.abs(ny)) {
    out.left = nx < 0
    out.right = nx > 0
  } else if (vertical) {
    out.up = ny < 0
    out.down = ny > 0
  }
  return out
}

/**
 * Clamp a normalized pointer delta to the unit circle. Returns a vector whose
 * magnitude is at most 1; `y` is NOT flipped here (still +y down). Used by the
 * thumbstick to keep the nub inside its well.
 */
export function clampStick(nx: number, ny: number): { x: number; y: number } {
  const m = Math.hypot(nx, ny)
  if (m > 1) return { x: nx / m, y: ny / m }
  return { x: nx, y: ny }
}

/** Apply a radial deadzone to a single normalized component: `|n| < dz` -> 0. */
export function deadzone(n: number, dz: number): number {
  return Math.abs(n) < dz ? 0 : n
}

/**
 * Turn a clamped pointer/axis delta into the final logical analog sample: flips
 * `y` so up is positive (the {@link AnalogInputEvent} convention) and applies a
 * per-axis deadzone. Input `clampedY` is screen-down-positive.
 */
export function stickSample(
  clampedX: number,
  clampedY: number,
  dz: number,
): { x: number; y: number } {
  return { x: deadzone(clampedX, dz), y: deadzone(-clampedY, dz) }
}

/** Fraction 0..1 of `value` within `[min, max]`, clamped. `min == max` -> 0 (no NaN). */
export function sliderPct(value: number, min: number, max: number): number {
  if (max === min) return 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export interface SliderPointerArgs {
  /** The pointer coordinate along the track axis (clientX or clientY). */
  clientPos: number
  /** The track's start coordinate (left for x, top for y). */
  trackStart: number
  /** The track's length in px (width for x, height for y). */
  trackLength: number
  min: number
  max: number
  /** Snap step; `null`/`undefined` is continuous. */
  step?: number | null
  axis: 'x' | 'y'
}

/**
 * Value from a pointer position along a track. The `x` axis runs left->right
 * (more to the right); the `y` axis runs bottom->top (more upward, throttle
 * style). Clamps to `[min, max]` and snaps to `step` when given.
 */
export function sliderValueFromPointer(args: SliderPointerArgs): number {
  const { clientPos, trackStart, trackLength, min, max, step, axis } = args
  let pct = trackLength <= 0 ? 0 : (clientPos - trackStart) / trackLength
  if (axis === 'y') pct = 1 - pct
  pct = Math.max(0, Math.min(1, pct))
  let value = min + pct * (max - min)
  if (step != null && step > 0) {
    value = Math.round((value - min) / step) * step + min
  }
  return Math.max(min, Math.min(max, value))
}

/* ----------------------------------------------------------------------------
 * Gamepad folding: turn two raw Standard-Gamepad snapshots into the same
 * logical events the touch controls emit. Pure and edge-triggered.
 * ------------------------------------------------------------------------- */

/** A frame snapshot of a physical gamepad: button values 0..1, axes -1..1. */
export interface GamepadSnapshot {
  buttons: number[]
  axes: number[]
}

/** Maps physical Standard-Gamepad indices to logical ids. Pure data. */
export interface GamepadMapping {
  /** Standard-Gamepad button index -> logical id. */
  buttons: Record<number, LogicalButtonId>
  /** Logical stick -> the two axis indices `[xAxis, yAxis]`. */
  axes: { left?: [number, number]; right?: [number, number] }
  /** Radial deadzone applied per axis. */
  deadzone?: number
}

/** A button counts as pressed at or above this analog value. */
const PRESS_THRESHOLD = 0.5

/**
 * Diff a previous and current gamepad snapshot into logical events, given a
 * mapping. Edge-triggered: a held button yields nothing; only transitions and
 * changed analog samples are emitted. `prev: null` treats the first frame as a
 * baseline (only non-zero analog and currently-pressed buttons fire).
 */
export function foldGamepad(
  prev: GamepadSnapshot | null,
  curr: GamepadSnapshot,
  mapping: GamepadMapping,
): { digital: DigitalInputEvent[]; analog: AnalogInputEvent[] } {
  const digital: DigitalInputEvent[] = []
  const analog: AnalogInputEvent[] = []
  const dz = mapping.deadzone ?? 0.12

  for (const key of Object.keys(mapping.buttons)) {
    const idx = Number(key)
    const id = mapping.buttons[idx]
    if (!id) continue
    const was = (prev?.buttons[idx] ?? 0) >= PRESS_THRESHOLD
    const now = (curr.buttons[idx] ?? 0) >= PRESS_THRESHOLD
    if (was !== now) digital.push({ id, pressed: now, source: 'gamepad' })
  }

  for (const side of ['left', 'right'] as AxisSide[]) {
    const pair = mapping.axes[side]
    if (!pair) continue
    const [xi, yi] = pair
    const cur = stickSample(curr.axes[xi] ?? 0, curr.axes[yi] ?? 0, dz)
    const before = prev ? stickSample(prev.axes[xi] ?? 0, prev.axes[yi] ?? 0, dz) : { x: 0, y: 0 }
    if (cur.x !== before.x || cur.y !== before.y) {
      analog.push({ side, x: cur.x, y: cur.y, source: 'gamepad' })
    }
  }

  return { digital, analog }
}
