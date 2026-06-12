# Controller kit

Player-side controls for controller-style games (a phone as a game pad), built as
reusable, theme-aware pieces in `@doot-games/ui`. This is Phase 1 of the Retro
Arcade work: the kit and its libraries, with no game logic and no transport. The
emulator flagship (Phase 2) and the WebRTC spectator stream (Phase 3) build on it.

A dev showcase lives at `/dev/controllers` (switch themes in the top bar; the new
**Bubblegum** pink theme is there). It logs every event as you touch a control.

## The logical-input contract

The kit's organizing idea: a touch control and a plugged-in gamepad emit the
**same** events, so a consumer wires either source identically. Defined in
`packages/ui/src/controllers/logical-input.ts`:

- `DigitalInputEvent { id, pressed, source? }` for buttons (press and release).
- `AnalogInputEvent { side, x, y, source? }` for sticks (`x` right-positive, `y`
  up-positive, already deadzoned; release sends `{x:0,y:0}`).

A logical `id` is an opaque string the layout author chooses (`'a'`, `'start'`,
`'cUp'`, ...). The kit never interprets it. **Mapping a logical id to a concrete
target** (an emulator input index, a keyboard key, a relay channel) is the
consumer's job, kept out of the kit on purpose.

Touch controls emit these via Vue events: `@input` (digital) and `@axis`
(analog). They never import CLASP, an emulator, or the engine.

## Components

Momentary / analog (emit the logical-input contract):

| Component | What it is |
| --- | --- |
| `PadButton` | An atomic momentary button, tinted by a theme accent hue, shaped round / pill / square. The building block of clusters. |
| `DPad` | A positional directional pad (one pointer's position decides active directions, so diagonals work). |
| `Thumbstick` | An analog stick with dead-zone, clamp, throttle, and auto-recenter. |
| `ActionCluster` | Face buttons in `row` / `diamond` / `six` / `abdiag` / `cbuttons` layouts, from a `buttons` definition. |
| `Buzzer` | The big buzz-in slam. |
| `Bumper` | A shoulder trigger. |
| `ControllerPad` | A whole pad assembled from a `ControllerLayout`. |

Settings widgets (use `v-model`, **not** part of the logical-input contract; a
gamepad has no slider):

`ControlSlider` (horizontal / stepped / vertical) · `Segmented` · `ToggleSwitch`.

Display: `ConnChip` (relay status) · `PlayerHeader` (identity + score).

Not duplicated (already in `@doot-games/ui`, reuse them): `OptionGrid`,
`RatingStrip`, `RankList`, `CountdownRing`, `JoinForm`, `RosterChips`, `Avatar`,
`ImageField`, `DButton`, `VoteBars`.

Every control reads only theme tokens (`--primary`, `--c1..--c5`, `--surface`,
`--ink`, `--line`, `--shadow`, ...), sizes responsively with `clamp()`, honors
`prefers-reduced-motion`, and is keyboard-operable.

### Multi-touch

Each momentary control owns its own pointer id (`usePointerButton.ts`), captured
with `setPointerCapture`. That is what lets a left-thumb d-pad and right-thumb
A/B work at once, and what keeps a hold alive when the thumb drifts off the
element. `pointercancel` mirrors `pointerup` so a stolen pointer never sticks
"down"; `touch-action: none` keeps the browser from scrolling mid-press.

## Controller layouts (data-driven pads)

`ControllerLayout` (`packages/ui/src/controllers/layout.ts`) is a
**target-agnostic** description of a pad: which clusters it has, each button's
logical id + label + hue + position, whether it has sticks, and the max players.
It carries logical ids only, so the same layout drives a touch pad, a remapped
gamepad, or a future user-authored controller, with no kit change.

```ts
import { defineLayout } from '@doot-games/ui'

export const myPad = defineLayout({
  id: 'my-pad',
  label: 'My Pad',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    { kind: 'dpad', buttons: [{ id: 'up', label: '⌃' }, { id: 'down', label: '⌄' }, { id: 'left', label: '‹' }, { id: 'right', label: '›' }] },
    { kind: 'face', layout: 'row', buttons: [{ id: 'b', label: 'B', hue: 'primary' }, { id: 'a', label: 'A', hue: 'primary' }] },
    { kind: 'system', buttons: [{ id: 'select', label: 'Select' }, { id: 'start', label: 'Start' }] },
  ],
})
```

Render it with `<ControllerPad :layout="myPad" @input="..." @axis="..." />`, or
compose the primitives by hand. Example presets (NES, SNES, N64, Game Boy,
Genesis, PlayStation) ship in `layout.presets.ts` / `BUILTIN_LAYOUTS`. Register
layouts with `registerLayout` / look them up with `getLayout` / `listLayouts`.

## Gamepad bridge

`createGamepadBridge` (`packages/ui/src/controllers/gamepad.ts`) reads a physical
USB/Bluetooth gamepad via the W3C Gamepad API and emits the **same** logical
events the touch controls do, through `onInput` / `onAxis` callbacks. The
physical-to-logical mapping is plain data (`GamepadMapping`), merged over
`STANDARD_GAMEPAD_MAPPING` and overridable live with `setMapping` (no restart).
It is framework-free and SSR-safe (a no-op where there is no Gamepad API).

```ts
const bridge = createGamepadBridge({
  onInput: (e) => relay(e.id, e.pressed),
  onAxis: (e) => relayAxis(e.side, e.x, e.y),
  onConnect: ({ id }) => showHint(id),
})
bridge.start() // stop() on unmount
```

`GamepadMapper.vue` is a remap UI that drives the bridge in a capture mode (an
identity mapping where each physical index reports itself) and emits an updated
`GamepadMapping` as the player binds each logical button.

## Pure helpers (tested)

`packages/ui/src/controllers/math.ts` holds the DOM-free geometry and the gamepad
fold, all unit-tested in `math.test.ts`: `dpadDirections`, `clampStick`,
`deadzone`, `stickSample`, `sliderPct`, `sliderValueFromPointer`, and
`foldGamepad` (the edge-triggered diff that makes touch and pad emit identical
events). The bridge lifecycle is covered in `gamepad.test.ts`.

## Where the target mapping lives

The kit stops at logical ids. The **Retro Arcade game** (Phase 2) owns the table
that maps a logical id to an EmulatorJS `simulateInput` index, and publishes
inputs over the relay's `/x/` channels. Keeping that table in the game (not the
kit) is what lets the kit serve emulators, custom controllers, and ROM publishing
without change.
