import type { MapDef } from './types'

/**
 * NEON OVERPASS - a rain-slick city flyover at night. Edge rails keep you on the
 * deck; traffic cones are solid. Cyan-and-magenta city glow.
 */
export const neon: MapDef = {
  id: 'neon',
  name: 'NEON OVERPASS',
  blurb: 'rain-slick night flyover',
  track: {
    control: [
      [-180, 0, -90],
      [-40, 0, -150],
      [110, 0, -150],
      [200, 0, -70],
      [150, 0, 10],
      [210, 0, 80],
      [120, 0, 150],
      [10, 0, 120],
      [-30, 0, 180],
      [-150, 0, 160],
      [-110, 0, 70],
      [-200, 0, 30],
      [-160, 0, -40],
    ],
    roadW: 13,
    voidFall: false,
    barrier: 'rails',
    scatter: [
      { kind: 'cone', count: 22, collideR: 0.9, scaleMin: 0.9, scaleMax: 1.2, gapMin: 3.2, bandMax: 26 },
    ],
  },
  theme: {
    sky: { stops: [[0, '#05030f'], [0.5, '#13093a'], [0.82, '#3a1170'], [1, '#7b1f9c']] },
    fog: { color: 0x140a2e, near: 120, far: 500 },
    hemi: [0x9be8ff, 0x2a1040, 0.7],
    sun: [0xff5d8f, 0.8, [160, 160, -120]],
    road: 'neon',
    roadLit: false,
    ambient: 'neon',
    swatch: 'linear-gradient(90deg,#05030f,#3a1170,#4ec3e0,#ff5d8f)',
  },
  backdrop: 'neon',
}
