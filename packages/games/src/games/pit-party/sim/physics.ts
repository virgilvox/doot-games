/**
 * Kart physics + per-kart progress. Pure and deterministic.
 *
 * Handling model is "heading-locked arcade": the kart moves along its heading
 * (never floaty, because there is no free lateral velocity to integrate), with a
 * scripted lateral slide during drift. On top of that proven KERF base we layer
 * the research findings: speed-scaled steering, three-tier mini-turbo, a non-sticky
 * slide wall response (v' minus the into-wall component), circle obstacle
 * collision, and ordered-gate lap counting that can't be cheated by reversing.
 */
import type { BakedTrack, Kart, RaceEvent } from './types'
import { nearestSample } from './track'
import { clamp, lerp, wrapAngle } from './vec'

/** Tunable constants. Speeds are world-units/second. */
export const PHYS = {
  baseTop: 34,
  accel: 27,
  drag: 0.8,
  brake: 40,
  reverseTop: -8,
  /** Below this speed the kart can't turn (grip ramps in). */
  gripSpeed: 9,
  baseTurn: 2.45,
  /** Active-boost multipliers. */
  boostTop: 1.3,
  boostAccel: 2.1,
  /** Off-road top-speed multiplier (when not boosting) + extra drag. */
  offTop: 0.42,
  offDrag: 1.5,
  /** Drift mini-turbo: charge thresholds (seconds-equivalent) and boost payouts (seconds). */
  driftTier: [1.0, 2.2, 3.6],
  driftPay: [0.8, 1.4, 2.4],
  driftLateral: 0.3,
} as const

const ev = (out: RaceEvent[], kind: RaceEvent['kind'], k: Kart, x?: number, y?: number, z?: number): void => {
  out.push({ kind, kartId: k.id, x, y, z })
}

/** True if forward arc (prev -> cur, increasing mod n) contains gate index g. */
function forwardArcHas(prev: number, cur: number, g: number, n: number): boolean {
  const delta = ((cur - prev) % n + n) % n
  if (delta === 0 || delta > n / 2) return false // standing still or a backward jump
  const off = ((g - prev) % n + n) % n
  return off > 0 && off <= delta
}

/**
 * Step one kart's motion, collision, and progress by `dt`. Inter-kart collisions,
 * item-box pickups, and projectiles are resolved by the Race orchestrator.
 * Appends discrete events (sparks, lap, finish, ...) to `events`.
 */
export function stepKart(
  track: BakedTrack,
  k: Kart,
  dt: number,
  racing: boolean,
  events: RaceEvent[],
): void {
  const { samples, n, roadW } = track

  // ---- gather controls -----------------------------------------------------
  let s = clamp(k.input.steer, -1, 1)
  let g = k.input.gas ? 1 : 0
  let b = k.input.brake ? 1 : 0
  let d = k.input.drift ? 1 : 0
  if (!racing || k.finished) {
    g = k.finished && k.ai ? 0.7 : 0
    b = 0
    d = 0
    if (!k.ai) s = 0
  }
  if (k.spinT > 0) {
    g = 0
    b = 0
    d = 0
    s = 0
  }
  if (k.shockT > 0) g *= 0.5

  // ---- falling off a void edge: dead controls, gravity, then respawn -------
  if (k.falling) {
    k.fallT += dt
    k.fallVy += 26 * dt
    k.y -= k.fallVy * dt
    k.x += Math.sin(k.heading) * k.speed * dt
    k.z += Math.cos(k.heading) * k.speed * dt
    k.speed *= 0.25 ** dt
    k.heading += dt * 4 * k.spinDir
    if (k.fallT > 1.15) {
      // Respawn at the last checkpoint legally passed (authored pose, facing forward).
      const cp = track.checkpoints[k.lastCp] ?? track.checkpoints[0]!
      k.x = cp.rx
      k.y = cp.ry
      k.z = cp.rz
      k.heading = cp.ryaw
      k.speed = 0
      k.falling = false
      k.fallVy = 0
      k.invulnT = 2
      k.boostT = 0
      k.shockT = 0
      k.drifting = false
      k.driftCharge = 0
      k.driftTier = 0
      const ns = nearestSample(track, k.x, k.z, cp.index)
      k.idx = ns.idx
      ev(events, 'respawn', k)
    }
    return
  }

  // ---- timers --------------------------------------------------------------
  if (k.boostT > 0) k.boostT -= dt
  if (k.shockT > 0) k.shockT -= dt
  if (k.invulnT > 0) k.invulnT -= dt
  if (k.slickCd > 0) k.slickCd -= dt
  if (k.wallCd > 0) k.wallCd -= dt
  if (k.bumpCd > 0) k.bumpCd -= dt
  if (k.spinT > 0) {
    k.spinT -= dt
    if (k.spinT <= 0) k.invulnT = 1.4
  }

  // ---- drift state machine (3-tier mini-turbo) -----------------------------
  if (!k.drifting && d && Math.abs(s) > 0.25 && k.speed > 12) {
    k.drifting = true
    k.driftDir = Math.sign(s) || 1
    k.driftCharge = 0
    k.driftTier = 0
  }
  if (k.drifting && (!d || k.speed < 7)) {
    const pay = PHYS.driftPay[k.driftTier - 1]
    if (k.driftTier >= 1 && pay) applyBoost(k, pay * lerpMini(k), events)
    k.drifting = false
    k.driftCharge = 0
    k.driftTier = 0
  }

  // ---- longitudinal speed --------------------------------------------------
  const off = k.offroad
  const offGrip = off ? lerp(PHYS.offTop, 0.7, clamp(k.stats.traction - 1, 0, 1)) : 1
  let top = PHYS.baseTop * k.stats.topSpeed * (k.ai ? k.ai.topMul : 1)
  if (k.boostT > 0) top *= PHYS.boostTop
  if (k.shockT > 0) top *= 0.56
  if (off && k.boostT <= 0) top *= offGrip
  if (g) k.speed += PHYS.accel * k.stats.accel * (k.boostT > 0 ? PHYS.boostAccel : 1) * dt
  if (b) {
    if (k.speed > 0.6) k.speed -= PHYS.brake * dt
    else k.speed -= 10 * dt
  }
  k.speed -= k.speed * PHYS.drag * dt
  if (off) k.speed -= k.speed * PHYS.offDrag * (2 - offGrip) * dt
  k.speed = clamp(k.speed, PHYS.reverseTop, top)

  // ---- steering ------------------------------------------------------------
  const grip = clamp(Math.abs(k.speed) / PHYS.gripSpeed, 0, 1)
  // Research: clamp steering authority at high speed so the kart doesn't spin out.
  const hiSpeed = clamp(Math.abs(k.speed) / (PHYS.baseTop * k.stats.topSpeed), 0, 1)
  const speedCut = lerp(1, 0.62, hiSpeed)
  let turnRate = PHYS.baseTurn * k.stats.handling * grip * speedCut * (k.speed < 0 ? -1 : 1)
  let effS = s
  if (k.drifting) {
    effS = k.driftDir * 0.72 + s * 0.55
    turnRate *= 1.5
    k.driftCharge += dt * (1 + Math.abs(s) * 0.6) * k.stats.miniTurbo
    const tier =
      k.driftCharge > PHYS.driftTier[2] ? 3 : k.driftCharge > PHYS.driftTier[1] ? 2 : k.driftCharge > PHYS.driftTier[0] ? 1 : 0
    k.driftTier = tier
  }
  if (k.spinT <= 0) k.heading += effS * turnRate * dt
  k.steerVis = lerp(k.steerVis, s, Math.min(1, dt * 10))

  // ---- move ----------------------------------------------------------------
  const fx = Math.sin(k.heading)
  const fz = Math.cos(k.heading)
  const rx = fz
  const rz = -fx
  k.x += fx * k.speed * dt
  k.z += fz * k.speed * dt
  if (k.drifting) {
    k.x += rx * -k.driftDir * Math.abs(k.speed) * PHYS.driftLateral * dt
    k.z += rz * -k.driftDir * Math.abs(k.speed) * PHYS.driftLateral * dt
  }

  // ---- track sample + off-road --------------------------------------------
  const prevIdx = k.idx
  const ns = nearestSample(track, k.x, k.z, k.idx)
  k.idx = ns.idx
  k.offroad = ns.dist > roadW / 2 + 0.6
  const sm = samples[k.idx]!
  k.y += (sm.y - k.y) * Math.min(1, dt * 9)
  k.wheelSpin += k.speed * dt * 1.6

  // ---- wall collision (lateral clamp + non-sticky slide) -------------------
  const bm = track.barrier[k.idx]
  if (bm) {
    const ox = k.x - sm.x
    const oz = k.z - sm.z
    let lat = ox * sm.rx + oz * sm.rz
    const along = ox * sm.dx + oz * sm.dz
    const lim = roadW / 2 + 1.45
    let hitSide = 0
    if (bm & 1 && lat > lim) {
      lat = lim - 0.04
      hitSide = 1
    } else if (bm & 2 && lat < -lim) {
      lat = -lim + 0.04
      hitSide = -1
    }
    if (hitSide) {
      // Push the kart back onto the road along the wall normal.
      k.x = sm.x + sm.dx * along + sm.rx * lat
      k.z = sm.z + sm.dz * along + sm.rz * lat
      const tdir = Math.atan2(sm.dx, sm.dz)
      const ang = wrapAngle(tdir - k.heading)
      const impact = Math.abs(Math.sin(ang))
      // Slide: steer the heading toward the wall tangent (kills the into-wall part).
      k.heading += clamp(ang, -1, 1) * Math.min(1, dt * 7)
      if (k.wallCd <= 0 && Math.abs(k.speed) > 5) {
        k.wallCd = 0.22
        const massKeep = clamp(1 - (0.12 + impact * 0.5) / k.stats.weight, 0.5, 0.95)
        k.speed *= massKeep
        ev(events, 'wall', k, k.x + sm.rx * hitSide * 1.1, k.y + 0.4, k.z + sm.rz * hitSide * 1.1)
      }
      if (k.drifting && impact > 0.5) {
        k.drifting = false
        k.driftCharge = 0
        k.driftTier = 0
      }
    }
  }

  // ---- obstacle (cactus / rock / post) collision: circle push-out ----------
  for (const o of track.obstacles) {
    const dx = k.x - o.x
    const dz = k.z - o.z
    const rr = o.r + 1.1
    const d2 = dx * dx + dz * dz
    if (d2 < rr * rr && d2 > 1e-6) {
      const dd = Math.sqrt(d2)
      const nxp = dx / dd
      const nzp = dz / dd
      k.x = o.x + nxp * rr
      k.z = o.z + nzp * rr
      // Kill the component of motion into the obstacle (slide), scaled by mass.
      if (k.bumpCd <= 0 && Math.abs(k.speed) > 6) {
        k.bumpCd = 0.3
        k.speed *= clamp(0.45 + (k.stats.weight - 1) * 0.2, 0.3, 0.7)
        if (k.drifting) {
          k.drifting = false
          k.driftCharge = 0
          k.driftTier = 0
        }
        ev(events, 'bump', k, k.x, k.y + 0.5, k.z)
      }
    }
  }

  // ---- over the edge on a void course --------------------------------------
  if (track.voidFall && !k.falling && ns.dist > roadW / 2 + 1.5) {
    k.falling = true
    k.fallT = 0
    k.fallVy = Math.max(1, Math.abs(k.speed) * 0.06)
    k.spinDir = k.spinDir || 1
    k.drifting = false
    k.driftCharge = 0
    k.driftTier = 0
    k.wrongT = 0
    ev(events, 'fall', k)
    return
  }

  // ---- lap / checkpoint counting (ordered gates) ---------------------------
  if (racing && !k.finished) {
    const cps = track.checkpoints
    const expected = cps[k.nextCp]
    if (expected && forwardArcHas(prevIdx, k.idx, expected.index, n)) {
      k.lastCp = k.nextCp
      // Crossing the finish gate (cp 0) after every prior gate completes a lap.
      // The orchestrator watches `k.lap` to emit lap/finalLap/finish (it knows the
      // total lap count); physics just advances state.
      if (k.nextCp === 0) k.lap++
      k.nextCp = (k.nextCp + 1) % cps.length
    }
    // wrong way
    const fdot = fx * sm.dx + fz * sm.dz
    if (fdot < -0.25 && Math.abs(k.speed) > 4) k.wrongT += dt
    else k.wrongT = 0
  } else {
    k.wrongT = 0
  }

  // ---- progress (ranking): accumulate signed forward arc deltas ------------
  // Summing small per-frame deltas is wrap-safe (no jump when arc length resets
  // across the finish line) and respawn-safe (a fall resets idx without a spurious
  // delta because we return early above). Driving backward correctly subtracts.
  let ds = samples[k.idx]!.s - samples[prevIdx]!.s
  if (ds < -track.length / 2) ds += track.length
  else if (ds > track.length / 2) ds -= track.length
  k.progress += ds
}

/** mini-turbo boost-length multiplier from the kart's stat. */
function lerpMini(k: Kart): number {
  return clamp(k.stats.miniTurbo, 0.7, 1.4)
}

/** Apply (or refresh) a forward boost for `dur` seconds. */
export function applyBoost(k: Kart, dur: number, events: RaceEvent[]): void {
  k.boostT = Math.max(k.boostT, dur)
  k.evBoost++
  ev(events, 'boost', k)
}

/** Spin the kart out (red-shell / oil hit). Returns false if shielded. */
export function spinout(k: Kart, sev: number, events: RaceEvent[]): boolean {
  if (k.invulnT > 0 || k.spinT > 0 || k.falling) return false
  k.spinT = 0.95 * sev
  k.spinDir = k.spinDir > 0 ? -1 : 1
  k.speed *= 0.3
  k.drifting = false
  k.driftCharge = 0
  k.driftTier = 0
  k.evHit++
  ev(events, 'hit', k)
  return true
}
