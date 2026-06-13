import type { MapDef } from './types'

/**
 * SPRUE FOUNDRY - a walled stadium circuit over the melt: two long straights, a
 * crisp chicane on the right and one wide hairpin at the top-left. Continuous edge
 * rails (with periodic gaps) keep you on the plate; stray barrels are solid.
 */
export const sprue: MapDef = {
  id: 'sprue',
  name: 'SPRUE FOUNDRY',
  blurb: 'walled circuit over the melt',
  track: {
    control: [
      // pit straight, eastbound
      [-160, 0, -135],
      [-40, 0, -145],
      [85, 0, -145],
      // right side up with a chicane
      [165, 0, -115],
      [185, 0, -45],
      [140, 0, 5],
      [185, 0, 60],
      [160, 0, 120],
      // back straight, westbound
      [60, 0, 145],
      [-50, 0, 145],
      // wide hairpin around the slag pot
      [-115, 0, 175],
      [-180, 0, 140],
      [-150, 0, 75],
      // home through a fast left kink
      [-200, 0, 0],
      [-185, 0, -80],
    ],
    roadW: 12.5,
    voidFall: false,
    barrier: 'rails',
    scatter: [
      { kind: 'barrel', count: 14, collideR: 1.3, scaleMin: 0.9, scaleMax: 1.5, gapMin: 4, bandMax: 36 },
    ],
  },
  theme: {
    sky: { stops: [[0, '#0a0709'], [0.55, '#1c0f12'], [0.85, '#4a1d14'], [1, '#8a3a1a']] },
    fog: { color: 0x1a0f0c, near: 90, far: 430 },
    hemi: [0xff9b5e, 0x1c0f14, 0.5],
    sun: [0xff7b3e, 0.7, [120, 140, -180]],
    road: 'sprue',
    roadLit: true,
    ambient: 'sprue',
    swatch: 'linear-gradient(90deg,#0a0709,#4a1d14,#ff9b2e)',
  },
  backdrop: 'sprue',
}
