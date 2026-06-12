/**
 * The phone controller layout per console. Most reuse the kit's built-in presets
 * (their logical button ids match this game's `touchIndex` in `logic.ts`); a few
 * extra consoles are authored inline with `defineLayout`. Keyed by a console's
 * `layoutKey`, so Game Boy and Game Boy Color share one layout. This file imports
 * the Vue-side kit, so it is used only from the components, never from `logic.ts`.
 */
import {
  type ControllerLayout,
  type LayoutCluster,
  defineLayout,
  gameboyLayout,
  genesisLayout,
  n64Layout,
  nesLayout,
  psxLayout,
  snesLayout,
} from '@doot-games/ui'

const dpad: LayoutCluster = {
  kind: 'dpad',
  buttons: [
    { id: 'up', label: '⌃' },
    { id: 'down', label: '⌄' },
    { id: 'left', label: '‹' },
    { id: 'right', label: '›' },
  ],
}

const gbaLayout = defineLayout({
  id: 'gba',
  label: 'GBA',
  maxPlayers: 1,
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

const smsLayout = defineLayout({
  id: 'sms',
  label: 'Master System',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    dpad,
    {
      kind: 'face',
      layout: 'row',
      buttons: [
        { id: 'b1', label: '1', hue: 'primary' },
        { id: 'b2', label: '2', hue: 'primary' },
      ],
    },
  ],
})

const pceLayout = defineLayout({
  id: 'pce',
  label: 'PC Engine',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    dpad,
    {
      kind: 'face',
      layout: 'row',
      buttons: [
        { id: 'two', label: 'II', hue: 'primary' },
        { id: 'one', label: 'I', hue: 'primary' },
      ],
    },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Sel' },
        { id: 'start', label: 'Run' },
      ],
    },
  ],
})

const atariLayout = defineLayout({
  id: 'atari2600',
  label: 'Atari 2600',
  maxPlayers: 2,
  hasStick: false,
  hasStickRight: false,
  clusters: [
    dpad,
    { kind: 'face', layout: 'row', buttons: [{ id: 'fire', label: 'Fire', hue: 'primary' }] },
    {
      kind: 'system',
      buttons: [
        { id: 'select', label: 'Select' },
        { id: 'reset', label: 'Reset' },
      ],
    },
  ],
})

/** Console layoutKey -> the controller layout to render on a phone. */
export const LAYOUTS: Record<string, ControllerLayout> = {
  nes: nesLayout,
  snes: snesLayout,
  n64: n64Layout,
  gb: gameboyLayout,
  gba: gbaLayout,
  genesis: genesisLayout,
  sms: smsLayout,
  psx: psxLayout,
  pce: pceLayout,
  atari2600: atariLayout,
}

export function layoutFor(layoutKey: string): ControllerLayout {
  return LAYOUTS[layoutKey] ?? nesLayout
}
