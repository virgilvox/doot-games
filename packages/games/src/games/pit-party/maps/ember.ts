import type { MapDef } from './types'

/**
 * EMBER WORKS - a tight, technical foundry floor under a volcanic sky. Corner
 * walls on the sharpest kinks; cooled-slag boulders are solid.
 */
export const ember: MapDef = {
  id: 'ember',
  name: 'EMBER WORKS',
  blurb: 'tight technical lava floor',
  track: {
    control: [
      [-140, 0, -130],
      [0, 0, -160],
      [140, 0, -130],
      [180, 0, -30],
      [110, 0, 30],
      [170, 0, 110],
      [60, 0, 150],
      [-40, 0, 110],
      [-30, 0, 180],
      [-150, 0, 150],
      [-120, 0, 50],
      [-190, 0, -20],
      [-150, 0, -80],
    ],
    roadW: 12,
    voidFall: false,
    barrier: 'corners',
    scatter: [
      { kind: 'rock', count: 18, collideR: 1.3, scaleMin: 0.9, scaleMax: 2.2, gapMin: 4.5, bandMax: 50 },
    ],
  },
  theme: {
    sky: { stops: [[0, '#0a0506'], [0.5, '#2a0c08'], [0.84, '#7a1f0a'], [1, '#e0521a']] },
    fog: { color: 0x1a0a06, near: 80, far: 420 },
    hemi: [0xff8a4e, 0x200c08, 0.6],
    sun: [0xff6a2e, 0.85, [-120, 120, 160]],
    road: 'ember',
    roadLit: true,
    ambient: 'ember',
    swatch: 'linear-gradient(90deg,#0a0506,#7a1f0a,#ff6a2e,#ffd23f)',
  },
  backdrop: 'ember',
}
