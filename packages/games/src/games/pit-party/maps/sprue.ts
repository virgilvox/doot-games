import type { MapDef } from './types'

/**
 * SPRUE FOUNDRY - a walled circuit over the melt. Continuous edge rails (with
 * periodic gaps) keep you on the plate; stray barrels are solid.
 */
export const sprue: MapDef = {
  id: 'sprue',
  name: 'SPRUE FOUNDRY',
  blurb: 'walled circuit over the melt',
  track: {
    control: [
      [-160, 0, -120],
      [-40, 0, -150],
      [90, 0, -140],
      [170, 0, -80],
      [130, 0, -10],
      [190, 0, 50],
      [150, 0, 130],
      [40, 0, 110],
      [-20, 0, 160],
      [-120, 0, 150],
      [-100, 0, 70],
      [-180, 0, 40],
      [-140, 0, -30],
      [-200, 0, -70],
    ],
    roadW: 12,
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
