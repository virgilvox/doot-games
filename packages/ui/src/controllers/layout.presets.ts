/**
 * Example controller layouts, rebuilt from the classic consoles the prototypes
 * targeted. These are LOGICAL-ID ONLY (no emulator input index, no core): a
 * consumer maps each id to its target. They are optional conveniences; a game
 * (or a user's custom-controller builder) can author its own with
 * {@link defineLayout}. Logical ids used: `up/down/left/right`, face `a/b/x/y`,
 * `start/select`, shoulders `l/r/z/l2/r2`, c-buttons `cUp/cDown/cLeft/cRight`,
 * PlayStation faces `triangle/square/circle/cross`, Genesis `a..z`.
 */
import { type ControllerLayout, defineLayout } from './layout'

const dpad: ControllerLayout['clusters'][number] = {
  kind: 'dpad',
  buttons: [
    { id: 'up', label: '⌃' },
    { id: 'down', label: '⌄' },
    { id: 'left', label: '‹' },
    { id: 'right', label: '›' },
  ],
}

/** Nintendo Entertainment System: d-pad, B/A, Select/Start. */
export const nesLayout = defineLayout({
  id: 'nes',
  label: 'NES',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    dpad,
    {
      kind: 'face',
      layout: 'row',
      buttons: [
        { id: 'b', label: 'B', hue: 'primary' },
        { id: 'a', label: 'A', hue: 'primary' },
      ],
    },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Select' },
        { id: 'start', label: 'Start' },
      ],
    },
  ],
})

/** Super Nintendo: d-pad, L/R shoulders, X/Y/A/B diamond, Select/Start. */
export const snesLayout = defineLayout({
  id: 'snes',
  label: 'SNES',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    {
      kind: 'shoulders',
      buttons: [
        { id: 'l', label: 'L' },
        { id: 'r', label: 'R' },
      ],
    },
    dpad,
    {
      kind: 'face',
      layout: 'diamond',
      buttons: [
        { id: 'x', label: 'X', hue: 'c4', pos: 'n' },
        { id: 'y', label: 'Y', hue: 'c5', pos: 'w' },
        { id: 'a', label: 'A', hue: 'primary', pos: 'e' },
        { id: 'b', label: 'B', hue: 'c1', pos: 's' },
      ],
    },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Select' },
        { id: 'start', label: 'Start' },
      ],
    },
  ],
})

/** Nintendo 64: d-pad, analog stick, L/Z/R, B/A diagonal pair, C-buttons, Start. */
export const n64Layout = defineLayout({
  id: 'n64',
  label: 'N64',
  maxPlayers: 4,
  hasStick: true,
  hasStickRight: false,
  clusters: [
    {
      kind: 'shoulders',
      buttons: [
        { id: 'l', label: 'L' },
        { id: 'z', label: 'Z' },
        { id: 'r', label: 'R' },
      ],
    },
    dpad,
    // Real N64 right hand: the yellow C-button diamond sits up-and-right, with the
    // A/B pair below-and-left of it. Render the C-buttons first (top of the right
    // column) then the A/B diagonal below, matching the hardware and the prototype.
    {
      kind: 'face',
      layout: 'cbuttons',
      buttons: [
        { id: 'cUp', label: 'C↑', hue: 'c1', pos: 'n' },
        { id: 'cDown', label: 'C↓', hue: 'c1', pos: 's' },
        { id: 'cLeft', label: 'C←', hue: 'c1', pos: 'w' },
        { id: 'cRight', label: 'C→', hue: 'c1', pos: 'e' },
      ],
    },
    {
      kind: 'face',
      layout: 'abdiag',
      buttons: [
        { id: 'b', label: 'B', hue: 'c5' },
        { id: 'a', label: 'A', hue: 'c4' },
      ],
    },
    { kind: 'system', buttons: [{ id: 'start', label: 'Start', hue: 'primary' }] },
  ],
})

/** Game Boy: d-pad, B/A, Select/Start. */
export const gameboyLayout = defineLayout({
  id: 'gb',
  label: 'Game Boy',
  maxPlayers: 1,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    dpad,
    {
      kind: 'face',
      layout: 'row',
      buttons: [
        { id: 'b', label: 'B', hue: 'c2' },
        { id: 'a', label: 'A', hue: 'c2' },
      ],
    },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Select' },
        { id: 'start', label: 'Start' },
      ],
    },
  ],
})

/** Sega Genesis: d-pad, six face buttons (X/Y/Z over A/B/C), Mode/Start. */
export const genesisLayout = defineLayout({
  id: 'genesis',
  label: 'Genesis',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    dpad,
    {
      kind: 'face',
      // Two arced rows: X/Y/Z on top, A/B/C below. The original pad was all black;
      // we give it a cool-top / warm-bottom palette so the six buttons are easy to
      // tell apart at a glance, left-to-right through the theme's accents.
      layout: 'six',
      buttons: [
        { id: 'x', label: 'X', hue: 'c4' },
        { id: 'y', label: 'Y', hue: 'c3' },
        { id: 'z', label: 'Z', hue: 'c2' },
        { id: 'a', label: 'A', hue: 'c5' },
        { id: 'b', label: 'B', hue: 'primary' },
        { id: 'c', label: 'C', hue: 'c1' },
      ],
    },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Mode' },
        { id: 'start', label: 'Start' },
      ],
    },
  ],
})

/** PlayStation: d-pad, two analog sticks, L1/R1/L2/R2, the four symbol faces. */
export const psxLayout = defineLayout({
  id: 'psx',
  label: 'PlayStation',
  maxPlayers: 2,
  hasStick: true,
  hasStickRight: true,
  clusters: [
    {
      kind: 'shoulders',
      buttons: [
        { id: 'l', label: 'L1' },
        { id: 'r', label: 'R1' },
        { id: 'l2', label: 'L2' },
        { id: 'r2', label: 'R2' },
      ],
    },
    dpad,
    {
      kind: 'face',
      layout: 'diamond',
      buttons: [
        { id: 'triangle', label: '△', hue: 'c5', pos: 'n' },
        { id: 'square', label: '□', hue: 'c3', pos: 'w' },
        { id: 'circle', label: '○', hue: 'primary', pos: 'e' },
        { id: 'cross', label: '✕', hue: 'c4', pos: 's' },
      ],
    },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Select' },
        { id: 'start', label: 'Start' },
      ],
    },
  ],
})

/** The built-in example layouts, for a host to enumerate or register in bulk. */
export const BUILTIN_LAYOUTS: ControllerLayout[] = [
  nesLayout,
  snesLayout,
  n64Layout,
  gameboyLayout,
  genesisLayout,
  psxLayout,
]
