/**
 * Pure, tested rules for Retro Arcade. This is the GAME-side mapping the
 * controller kit deliberately leaves out: it turns the kit's console-agnostic
 * LOGICAL ids (`'a'`, `'cUp'`, `'start'`, a left/right stick axis) into the exact
 * EmulatorJS `simulateInput` indices for each console, detects a console from a
 * ROM filename, assigns seats (host gamepads and phones share one pool), and
 * builds the shareable deep link. No DOM, no EmulatorJS, no Vue here.
 *
 * Two maps per console keep the touch surface and a physical gamepad consistent:
 *  - `touchIndex`: a console's touch logical id (matching its layout) -> emu index.
 *  - `padAlias`:   a Standard-Gamepad position id ('a' = south, 'l2' = LT, ...) ->
 *                  that console's touch id, so a plugged-in pad maps the same way.
 * The host (and the phone, for its own pad) always resolve to a touch id, then to
 * an emu index, so every input source flows through one tested path.
 */

/** Analog full-scale, the value EmulatorJS expects for a fully deflected axis. */
export const ANALOG_FULL = 0x7fff

export type LeftStickRole = 'analog' | 'dpad'
export type RightStickRole = 'analog2' | 'cbtns' | null

export interface ConsoleSpec {
  key: string
  /** EmulatorJS core name. */
  core: string
  label: string
  /** Max simultaneous controllers (seats). */
  max: number
  /** Which kit layout to render on the phone. */
  layoutKey: string
  /** How the left stick is delivered to the core. */
  leftStick: LeftStickRole
  /** How the right stick is delivered (or none). */
  rightStick: RightStickRole
  /** Cores that benefit from threads (only used when the page is cross-origin isolated). */
  threaded?: boolean
  /** Touch logical id -> EmulatorJS simulateInput index. */
  touchIndex: Record<string, number>
  /** Standard-Gamepad position id -> this console's touch id. */
  padAlias: Record<string, string>
}

const DIRS = { up: 4, down: 5, left: 6, right: 7 }
const PAD_DIRS = { up: 'up', down: 'down', left: 'left', right: 'right' }

export const CONSOLES: Record<string, ConsoleSpec> = {
  nes: {
    key: 'nes',
    core: 'nes',
    label: 'NES',
    max: 2,
    layoutKey: 'nes',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'a', b: 'b', select: 'select', start: 'start', ...PAD_DIRS },
  },
  snes: {
    key: 'snes',
    core: 'snes',
    label: 'SNES',
    max: 2,
    layoutKey: 'snes',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b: 0, y: 1, select: 2, start: 3, a: 8, x: 9, l: 10, r: 11, ...DIRS },
    padAlias: {
      a: 'a',
      b: 'b',
      x: 'x',
      y: 'y',
      l: 'l',
      r: 'r',
      select: 'select',
      start: 'start',
      ...PAD_DIRS,
    },
  },
  n64: {
    key: 'n64',
    core: 'n64',
    label: 'N64',
    max: 4,
    layoutKey: 'n64',
    leftStick: 'analog',
    rightStick: 'cbtns',
    threaded: true,
    touchIndex: {
      a: 0,
      b: 1,
      start: 3,
      l: 10,
      r: 11,
      z: 12,
      cRight: 20,
      cLeft: 21,
      cDown: 22,
      cUp: 23,
      ...DIRS,
    },
    padAlias: { a: 'a', b: 'b', l: 'l', r: 'r', l2: 'z', start: 'start', ...PAD_DIRS },
  },
  gb: {
    key: 'gb',
    core: 'gb',
    label: 'Game Boy',
    max: 1,
    layoutKey: 'gb',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'a', b: 'b', select: 'select', start: 'start', ...PAD_DIRS },
  },
  gbc: {
    key: 'gbc',
    core: 'gbc',
    label: 'Game Boy Color',
    max: 1,
    layoutKey: 'gb',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'a', b: 'b', select: 'select', start: 'start', ...PAD_DIRS },
  },
  gba: {
    key: 'gba',
    core: 'gba',
    label: 'GBA',
    max: 1,
    layoutKey: 'gba',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, l: 10, r: 11, ...DIRS },
    padAlias: { a: 'a', b: 'b', l: 'l', r: 'r', select: 'select', start: 'start', ...PAD_DIRS },
  },
  genesis: {
    key: 'genesis',
    core: 'segaMD',
    label: 'Genesis',
    max: 2,
    layoutKey: 'genesis',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b: 0, a: 1, select: 2, start: 3, c: 8, y: 9, x: 10, z: 11, ...DIRS },
    padAlias: {
      a: 'a',
      b: 'b',
      x: 'x',
      y: 'y',
      l: 'z',
      r: 'c',
      select: 'select',
      start: 'start',
      ...PAD_DIRS,
    },
  },
  sms: {
    key: 'sms',
    core: 'segaMS',
    label: 'Master System',
    max: 2,
    layoutKey: 'sms',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { b1: 0, b2: 8, ...DIRS },
    padAlias: { a: 'b1', b: 'b2', ...PAD_DIRS },
  },
  psx: {
    key: 'psx',
    core: 'psx',
    label: 'PlayStation',
    max: 2,
    layoutKey: 'psx',
    leftStick: 'analog',
    rightStick: 'analog2',
    threaded: true,
    touchIndex: {
      cross: 0,
      square: 1,
      select: 2,
      start: 3,
      circle: 8,
      triangle: 9,
      l: 10,
      r: 11,
      l2: 12,
      r2: 13,
      ...DIRS,
    },
    padAlias: {
      a: 'cross',
      b: 'circle',
      x: 'square',
      y: 'triangle',
      l: 'l',
      r: 'r',
      l2: 'l2',
      r2: 'r2',
      select: 'select',
      start: 'start',
      ...PAD_DIRS,
    },
  },
  pce: {
    key: 'pce',
    core: 'pce',
    label: 'PC Engine',
    max: 2,
    layoutKey: 'pce',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { two: 0, one: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'one', b: 'two', select: 'select', start: 'start', ...PAD_DIRS },
  },
  atari2600: {
    key: 'atari2600',
    core: 'atari2600',
    label: 'Atari 2600',
    max: 2,
    layoutKey: 'atari2600',
    leftStick: 'dpad',
    rightStick: null,
    touchIndex: { fire: 0, select: 2, reset: 3, ...DIRS },
    padAlias: { a: 'fire', select: 'select', start: 'reset', ...PAD_DIRS },
  },
}

/** File-extension -> console key (covers common ROM/disc extensions). */
export const EXT_TO_CONSOLE: Record<string, string> = {
  nes: 'nes',
  fds: 'nes',
  sfc: 'snes',
  smc: 'snes',
  swc: 'snes',
  fig: 'snes',
  n64: 'n64',
  z64: 'n64',
  v64: 'n64',
  gb: 'gb',
  sgb: 'gb',
  gbc: 'gbc',
  gba: 'gba',
  md: 'genesis',
  gen: 'genesis',
  smd: 'genesis',
  sms: 'sms',
  gg: 'sms',
  pce: 'pce',
  a26: 'atari2600',
  iso: 'psx',
  cue: 'psx',
  pbp: 'psx',
  chd: 'psx',
}

/** The consoles in a stable display order for the host's picker. */
export const CONSOLE_LIST: ConsoleSpec[] = Object.values(CONSOLES)

/** Resolve a console spec by key, falling back to NES. */
export function consoleSpec(key: string | null | undefined): ConsoleSpec {
  return (key && CONSOLES[key]) || CONSOLES.nes!
}

/** Detect a console key from a ROM filename or URL by its extension, or null. */
export function detectConsole(nameOrUrl: string): string | null {
  const clean = nameOrUrl.split(/[?#]/)[0] ?? nameOrUrl
  const ext = (clean.split('.').pop() ?? '').toLowerCase()
  return EXT_TO_CONSOLE[ext] ?? null
}

/** Strip the directory + extension from a filename/URL to a display game name. */
export function gameNameOf(nameOrUrl: string): string {
  const clean = (nameOrUrl.split(/[?#]/)[0] ?? nameOrUrl).split('/').pop() ?? 'game'
  return clean.replace(/\.[^.]+$/, '') || 'game'
}

/** The first open seat index in a fixed-size seat array, or -1 if full. */
export function nextFreeSeat(seats: Array<unknown>, max: number): number {
  for (let i = 0; i < max; i++) if (seats[i] == null) return i
  return -1
}

/** Build a shareable deep link that boots straight into a ROM url + console. */
export function shareLink(origin: string, romUrl: string, consoleKey: string): string {
  const u = new URL('/host/retro-arcade', origin)
  u.searchParams.set('rom', romUrl)
  if (consoleKey) u.searchParams.set('core', consoleKey)
  return u.toString()
}

/** Active directions for a screen-up-positive analog sample past a threshold. */
export function axisToDirections(
  x: number,
  y: number,
  threshold = 0.5,
): { up: boolean; down: boolean; left: boolean; right: boolean } {
  return { up: y > threshold, down: y < -threshold, left: x < -threshold, right: x > threshold }
}

/**
 * Split a screen-up-positive analog sample into the four EmulatorJS axis indices
 * starting at `base` (16 = left stick, 20 = right stick): base+0 right, base+1
 * left, base+2 down, base+3 up. Values are the signed full-scale magnitude.
 */
export function analogToEmu(x: number, y: number, base: number): Array<[number, number]> {
  const m = ANALOG_FULL
  return [
    [base + 0, x > 0 ? Math.round(m * x) : 0],
    [base + 1, x < 0 ? Math.round(-m * x) : 0],
    [base + 2, y < 0 ? Math.round(-m * y) : 0],
    [base + 3, y > 0 ? Math.round(m * y) : 0],
  ]
}

/** The four C-button touch ids for the right-stick directions, N64 style. */
export const CBTN_BY_DIR = { up: 'cUp', down: 'cDown', left: 'cLeft', right: 'cRight' } as const

/** Translate a Standard-Gamepad position id to this console's touch id, or null. */
export function aliasToTouch(spec: ConsoleSpec, positionId: string): string | null {
  return spec.padAlias[positionId] ?? null
}

/** Resolve a touch logical id to an EmulatorJS index for a console, or null. */
export function emuIndexFor(spec: ConsoleSpec, touchId: string): number | null {
  const i = spec.touchIndex[touchId]
  return i == null ? null : i
}
