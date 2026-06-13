import type { MapDef } from './types'

/**
 * NEON OVERPASS - rain-slick city streets at night. Three long avenues joined by
 * rounded 90-degree corners and two cross-streets, so it reads as a real street
 * circuit: collidable tower blocks wall the verges into glowing canyons, street
 * lamps line the kerbs, edge rails break at the "intersections". Cyan-and-magenta
 * city glow.
 */
export const neon: MapDef = {
  id: 'neon',
  name: 'NEON OVERPASS',
  blurb: 'night city street circuit',
  track: {
    control: [
      // bottom avenue, eastbound (the start/finish straight)
      [-190, 0, -150],
      [-60, 0, -150],
      [80, 0, -150],
      [180, 0, -150],
      // NE corner up the right vertical street
      [215, 0, -110],
      [215, 0, -65],
      [215, 0, -20],
      // westbound cross-street
      [175, 0, 15],
      [90, 0, 15],
      // north up the mid-town block
      [58, 0, 48],
      [58, 0, 130],
      // top avenue, westbound
      [20, 0, 168],
      [-80, 0, 168],
      [-170, 0, 168],
      // SW corner down the long left straight (boost zone)
      [-205, 0, 130],
      [-205, 0, 10],
      [-205, 0, -110],
    ],
    roadW: 14,
    voidFall: false,
    barrier: 'rails',
    scatter: [
      // the city itself: collidable tower blocks walling the streets
      { kind: 'building', count: 44, collideR: 7, scaleMin: 0.85, scaleMax: 1.5, gapMin: 11, bandMax: 30 },
      // street lamps right on the kerb line
      { kind: 'lamp', count: 26, collideR: 0.45, scaleMin: 0.95, scaleMax: 1.15, gapMin: 1.6, bandMax: 4.5 },
      // a few stray traffic cones
      { kind: 'cone', count: 10, collideR: 0.9, scaleMin: 0.9, scaleMax: 1.2, gapMin: 2.6, bandMax: 7 },
    ],
  },
  theme: {
    sky: { stops: [[0, '#05030f'], [0.5, '#13093a'], [0.82, '#3a1170'], [1, '#7b1f9c']] },
    fog: { color: 0x140a2e, near: 130, far: 520 },
    hemi: [0x9be8ff, 0x2a1040, 0.78],
    sun: [0xff5d8f, 0.85, [160, 160, -120]],
    road: 'neon',
    roadLit: false,
    ambient: 'neon',
    swatch: 'linear-gradient(90deg,#05030f,#3a1170,#4ec3e0,#ff5d8f)',
  },
  backdrop: 'neon',
}
