import type { MapDef } from './types'

/**
 * EMBER WORKS - the technical course: a foundry floor under a volcanic sky with a
 * right-side ess, a tight inner loop and a left chicane (but no self-crossings -
 * tight should mean precise, not broken). Corner walls on the sharpest kinks;
 * cooled-slag boulders are solid.
 */
export const ember: MapDef = {
  id: 'ember',
  name: 'EMBER WORKS',
  blurb: 'tight technical lava floor',
  track: {
    control: [
      // start straight
      [-150, 0, -130],
      [-30, 0, -155],
      [90, 0, -150],
      [170, 0, -110],
      // right-side ess
      [185, 0, -30],
      [130, 0, 20],
      [175, 0, 90],
      // dip toward the works and out again
      [110, 0, 150],
      [10, 0, 115],
      // top-left sweep
      [-60, 0, 160],
      [-150, 0, 140],
      // left chicane home
      [-110, 0, 60],
      [-190, 0, 15],
      [-160, 0, -70],
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
