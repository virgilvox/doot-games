/**
 * The typed `/x/` channel contract between the Host (big screen) and the phone
 * controllers. Doot's room already handles join / roster / reconnect-by-name, so
 * these channels carry only game data: the shared race state, each driver's
 * selection + seat, live controller input, and per-driver telemetry. WebRTC
 * spectator signaling rides separate `rtc/*` channels (see stream.ts).
 */

/** The shared game phase, broadcast on the retained `state` channel. */
export type Phase = 'lobby' | 'select' | 'count' | 'race' | 'finish'

/** Host -> all (retained): the shared race state. */
export interface StateMsg {
  phase: Phase
  mapId: string
  laps: number
  /** 1-based race number within the cup. */
  race: number
  /** Total races in the cup (1 = single race). */
  cupRaces: number
  /** Race clock in ms (0 outside of a live race). */
  clock: number
  /** Countdown number (3..1, 0 = GO) during 'count'. */
  count: number
}

/** Host -> all (retained): which characters/carts are taken, for the select grid. */
export interface RosterMsg {
  takenChars: string[]
}

/** Phone -> host: this driver's selection during the 'select' phase. */
export interface PickMsg {
  charId: string
  cartId: string
  ready: boolean
}

/** Host -> phone (retained, per pid): the confirmed seat + look. */
export interface SeatMsg {
  /** Grid/pane index, or -1 if the grid is full (spectator). */
  seat: number
  charId: string
  cartId: string
  paint: number
  locked: boolean
}

/** Phone -> host: continuous controller input (steer + buttons), ~30Hz. */
export interface InputMsg {
  s: number
  g: number
  b: number
  d: number
}

/** Host -> phone (per pid): the driver's HUD telemetry. */
export interface TeleMsg {
  /** rank */
  r: number
  /** lap */
  l: number
  /** total laps */
  L: number
  /** speed (kph) */
  s: number
  /** held item kind ('' if none) */
  i: string
  /** countdown (3..1, 0 GO, -1 none) */
  c: number
  /** finishing place (0 until finished) */
  p: number
  /** phase */
  st: Phase
  /** rising-edge event counters for haptics */
  hit: number
  pick: number
  boost: number
}

/** Channel keys. Per-player channels are suffixed with the player's id. */
export const CH = {
  state: 'state',
  roster: 'roster',
  host: 'host',
  pick: (pid: string) => `pick/${pid}`,
  seat: (pid: string) => `seat/${pid}`,
  input: (pid: string) => `in/${pid}`,
  item: (pid: string) => `item/${pid}`,
  tele: (pid: string) => `tele/${pid}`,
} as const

/** Extract the player id from a wildcard `<kind>/<pid>` key. */
export const pidOf = (key: string): string => key.split('/')[1] ?? ''
