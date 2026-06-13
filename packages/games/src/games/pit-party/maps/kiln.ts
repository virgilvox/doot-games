import type { MapDef } from './types'

/**
 * KILN CANYON - a dusk-desert sweeper: long flowing curves, one double-apex ess on
 * the right and a sweeping carousel left. Corner walls on the four sharpest bends;
 * collidable cacti + rocks line the verges (the prop you see is the one you hit,
 * placed deterministically so it never sits on the road).
 */
export const kiln: MapDef = {
  id: 'kiln',
  name: 'KILN CANYON',
  blurb: 'dusk desert sweeper',
  track: {
    control: [
      // start/finish straight along the canyon floor
      [-150, 0, -120],
      [-50, 0, -140],
      [60, 0, -140],
      [150, 0, -110],
      // right-side double-apex ess climbing the dunes
      [200, 0, -40],
      [185, 0, 55],
      [130, 0, 115],
      // top sweep
      [30, 0, 105],
      [-50, 0, 145],
      [-140, 0, 150],
      // carousel left and home
      [-200, 0, 90],
      [-175, 0, 5],
      [-205, 0, -70],
    ],
    roadW: 13,
    voidFall: false,
    barrier: 'corners',
    scatter: [
      { kind: 'cactus', count: 22, collideR: 1.3, scaleMin: 0.9, scaleMax: 2.2, gapMin: 5, bandMax: 64 },
      { kind: 'rock', count: 20, collideR: 1.2, scaleMin: 0.8, scaleMax: 2.6, gapMin: 6, bandMax: 78 },
    ],
  },
  theme: {
    sky: { stops: [[0, '#241a44'], [0.45, '#5b3458'], [0.74, '#d96f4f'], [1, '#ffc46b']] },
    fog: { color: 0xc96f4e, near: 140, far: 560 },
    hemi: [0xffd9b0, 0x5a3b6b, 0.95],
    sun: [0xffb36b, 1.15, [-180, 90, -260]],
    road: 'kiln',
    roadLit: true,
    ambient: 'kiln',
    swatch: 'linear-gradient(90deg,#241a44,#d96f4f,#ffc46b)',
  },
  backdrop: 'kiln',
}
