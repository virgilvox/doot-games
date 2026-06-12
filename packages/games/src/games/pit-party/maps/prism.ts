import type { MapDef } from './types'

/**
 * PRISM RUN - an orbital ribbon with no rails. Drive off the edge and Lakitu
 * fishes you out (void-fall respawn at the last gate). Elevation changes too.
 */
export const prism: MapDef = {
  id: 'prism',
  name: 'PRISM RUN',
  blurb: 'orbital ribbon, mind the edge',
  track: {
    control: [
      [-190, 2, -110],
      [-70, 8, -165],
      [70, 16, -170],
      [180, 22, -110],
      [225, 14, 0],
      [180, 4, 105],
      [90, 10, 170],
      [-30, 22, 185],
      [-130, 28, 130],
      [-95, 18, 40],
      [-150, 8, -10],
      [-215, 4, -55],
    ],
    roadW: 14,
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
