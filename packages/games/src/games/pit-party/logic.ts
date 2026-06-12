/**
 * Public surface of the Pit Party pure simulation + a few shared pure helpers.
 *
 * Everything re-exported here is Three.js-free and unit-tested (see logic.test.ts).
 * The renderer (engine/) and the Vue host read this; nothing here touches the DOM.
 */
export type {
  AiState,
  BakedTrack,
  Checkpoint,
  ItemBoxSpawn,
  ItemKind,
  Kart,
  KartInput,
  KartStats,
  Obstacle,
  RaceEvent,
  RaceEventKind,
  TrackBounds,
  TrackSample,
} from './sim/types'
export { emptyInput } from './sim/types'

export { bakeTrack, nearestSample } from './sim/track'
export type { ScatterSpec, TrackDef } from './sim/track'

export { PHYS, applyBoost, spinout, stepKart } from './sim/physics'
export { rollItem, updateItems, useItem } from './sim/items'
export type { ItemWorld, Projectile, Slick } from './sim/items'
export { aiThink, aiUseItem, makeAi } from './sim/ai'
export { Race } from './sim/race'
export type { ItemBox, KartSpec, RaceState } from './sim/race'
export { POINTS_TABLE, pointsForPlace, sortCup, tallyCup } from './sim/standings'
export type { CupStanding, RaceFinish } from './sim/standings'

export { clamp, lerp, wrapAngle, makeRng } from './sim/vec'
export type { Vec3 } from './sim/vec'

import type { KartStats } from './sim/types'
import { clamp } from './sim/vec'

/** Ordinal suffix: 1 -> "1ST", 4 -> "4TH". */
export function ord(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Format milliseconds as m:ss.s. */
export function fmtTime(ms: number): string {
  const t = Math.max(0, ms)
  const m = Math.floor(t / 60000)
  const s = (t % 60000) / 1000
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/** Convert a u/s speed to a chunky arcade "KPH" readout. */
export function kph(speed: number): number {
  return Math.abs(speed * 3.1) | 0
}

/**
 * Blend a character bias and a cart bias into effective driving stats. Each input
 * is a partial set of deltas around 1.0; the result is clamped to a sane band so
 * no combo is broken. This is the Mario-Kart "driver + vehicle" stat model.
 */
export function blendStats(
  charBias: Partial<KartStats>,
  cartBias: Partial<KartStats>,
): KartStats {
  const axis = (key: keyof KartStats): number => {
    const c = (charBias[key] ?? 1) - 1
    const v = (cartBias[key] ?? 1) - 1
    return clamp(1 + c + v, 0.78, 1.28)
  }
  return {
    topSpeed: axis('topSpeed'),
    accel: axis('accel'),
    handling: axis('handling'),
    traction: axis('traction'),
    weight: axis('weight'),
    miniTurbo: axis('miniTurbo'),
  }
}
