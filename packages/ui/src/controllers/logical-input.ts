/**
 * The logical-input contract: the single vocabulary every controller surface
 * speaks. A touch control (DPad, ActionCluster, Thumbstick, ...) and a
 * plugged-in physical gamepad (via {@link createGamepadBridge}) both emit these
 * identical structs, so a consumer wires either source the same way and never
 * needs to know whether a press came from a thumb or a Bluetooth pad.
 *
 * This module is intentionally tiny and dependency-free (no Vue, no engine, no
 * CLASP, no EmulatorJS). The IDs are opaque strings the layout author chooses;
 * mapping a logical id to a concrete target (an emulator input index, a keyboard
 * key, a relay channel) is the CONSUMER's job, kept out of the kit on purpose.
 */

/**
 * A logical button id chosen by the layout author, e.g. `'a'`, `'b'`, `'start'`,
 * `'up'`, `'cUp'`, `'l'`. The kit never interprets it; it only passes it through.
 */
export type LogicalButtonId = string

/** Which analog stick an axis sample came from. */
export type AxisSide = 'left' | 'right'

/** Where a logical event originated. Always optional; consumers may ignore it. */
export type InputSource = 'touch' | 'gamepad' | 'keyboard'

/**
 * A digital button transition. `pressed` is the NEW state (true = down). A
 * control emits this on both press and release, so a handler is one function:
 * `onInput(e) { target(e.id, e.pressed) }`.
 */
export interface DigitalInputEvent {
  id: LogicalButtonId
  pressed: boolean
  source?: InputSource
}

/**
 * A 2-axis analog sample, already normalized and deadzoned to the range -1..1.
 * `y` is screen-intuitive: `+1` means up, `-1` means down (NOT raw pointer dy).
 * `x`: `+1` means right. A release emits `{ x: 0, y: 0 }`.
 */
export interface AnalogInputEvent {
  side: AxisSide
  x: number
  y: number
  source?: InputSource
}
