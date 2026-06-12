/**
 * CPU brains. Pure-pursuit path tracking (research: chase a look-ahead point that
 * scales with speed, never a fixed waypoint) plus the patented Mario Kart
 * rubber-band model (a per-CPU target place; boost when behind it, ease off when
 * ahead) tuned to read as fair, not blatant.
 */
import { type ItemWorld, useItem } from './items'
import type { AiState, BakedTrack, Kart, RaceEvent } from './types'
import { clamp, wrapAngle } from './vec'

export function makeAi(targetPlace: number, rng: () => number): AiState {
  return {
    lane: (rng() * 2 - 1) * 2.6,
    laneT: 3 + rng() * 4,
    skill: 0.86 + rng() * 0.2,
    itemT: 2 + rng() * 3,
    targetPlace,
    topMul: 1,
  }
}

/** Decide one CPU kart's input for this frame. Mutates `k.input` + `k.ai`. */
export function aiThink(
  track: BakedTrack,
  k: Kart,
  karts: Kart[],
  racing: boolean,
  dt: number,
  rng: () => number,
): void {
  const a = k.ai
  if (!a) return
  const { samples, n } = track

  a.laneT -= dt
  if (a.laneT <= 0) {
    a.lane = (rng() * 2 - 1) * 2.8
    a.laneT = 3 + rng() * 5
  }

  // ---- pure-pursuit: aim at a point ahead, look-ahead grows with speed ------
  const look = Math.round(12 + Math.abs(k.speed) * 0.55)
  const ti = (k.idx + look) % n
  const tm = samples[ti]!
  const tx = tm.x + tm.rx * a.lane
  const tz = tm.z + tm.rz * a.lane
  const want = Math.atan2(tx - k.x, tz - k.z)
  const err = wrapAngle(want - k.heading)

  k.input.steer = clamp(err * 2.4 * a.skill, -1, 1)
  k.input.gas = racing ? 1 : 0
  k.input.brake = Math.abs(err) > 1.1 && k.speed > 22 ? 1 : 0
  // Drift the sharp bends to bank mini-turbos like a human would.
  if (!k.input.drift && Math.abs(err) > 0.52 && k.speed > 15) k.input.drift = 1
  else if (k.input.drift && Math.abs(err) < 0.22) k.input.drift = 0

  // ---- rubber-band (patent): nudge top speed toward the target place --------
  let lead = -Infinity
  for (const o of karts) if (o.progress > lead) lead = o.progress
  const gap = Math.max(0, lead - k.progress)
  let mul = 1 + clamp(gap / (track.length * 1.2), 0, 1) * 0.18
  if (k.rank > a.targetPlace) mul *= 1.04
  else if (k.rank < a.targetPlace) mul *= 0.97
  a.topMul = clamp(mul, 0.9, 1.22)
}

/** Decide whether a CPU should fire its held item this frame. */
export function aiUseItem(
  world: ItemWorld,
  k: Kart,
  dt: number,
  rng: () => number,
  events: RaceEvent[],
): void {
  const a = k.ai
  if (!a || !k.item) return
  a.itemT -= dt
  if (a.itemT > 0) return
  let fire = false
  if (k.item === 'boost' || k.item === 'triple') {
    // Use a boost on a straight (where it's worth the most).
    fire = Math.abs(k.input.steer) < 0.3
  } else if (k.item === 'wrench') {
    for (const o of world.karts) {
      if (o === k) continue
      const d = Math.hypot(o.x - k.x, o.z - k.z)
      if (d < 30 && o.progress > k.progress) {
        fire = true
        break
      }
    }
  } else {
    // slick (drop behind) / volt (zap the field): just use it.
    fire = true
  }
  if (fire) {
    useItem(world, k, events)
    a.itemT = 2.5 + rng() * 3.5
  } else {
    a.itemT = 0.4
  }
}
