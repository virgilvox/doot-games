import type { MapDef } from './types'

/**
 * PRISM RUN - an orbital ribbon with no rails. Drive off the edge and you respawn
 * at the last gate. Wide flowing sweepers ONLY (a void course punishes falls, so
 * the geometry never demands a hairpin) with smooth rolling elevation.
 */
export const prism: MapDef = {
  id: 'prism',
  name: 'PRISM RUN',
  blurb: 'orbital ribbon, mind the edge',
  track: {
    control: [
      [-180, 2, -110],
      [-60, 8, -160],
      [80, 14, -160],
      [180, 20, -100],
      [225, 16, 10],
      [170, 10, 110],
      [50, 16, 165],
      [-70, 22, 160],
      [-150, 24, 80],
      [-160, 14, -20],
    ],
    roadW: 15,
    voidFall: true,
    barrier: 'none',
  },
  theme: {
    sky: 'stars',
    fog: null,
    hemi: [0xcfd8ff, 0x1a1030, 0.85],
    sun: [0xffffff, 0.9, [200, 260, 120]],
    road: 'prism',
    roadLit: false,
    ambient: 'prism',
    swatch: 'linear-gradient(90deg,#ff5d8f,#ff9b2e,#ffd23f,#5fe08a,#4ec3e0,#b48ae0)',
  },
  backdrop: 'prism',
}
