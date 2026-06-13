/**
 * Items: the roll table and the in-flight effects. Pure and deterministic.
 *
 * Roll weighting follows the Mario Kart principle (research): the table is keyed
 * by DISTANCE BEHIND THE LEADER, not raw place. The leader pulls defensive/utility
 * items (oil slick, wrench); only meaningfully-behind karts pull catch-up power
 * (boost, triple, volt). This keeps a runaway leader from also getting the strong
 * items, and gives the back of the pack a real shot.
 */
import { applyBoost, spinout } from './physics'
import { nearestSample } from './track'
import type { BakedTrack, ItemKind, Kart, RaceEvent } from './types'
import { clamp, lerp } from './vec'

/** A homing wrench in flight. */
export interface Projectile {
  x: number
  y: number
  z: number
  heading: number
  life: number
  arm: number
  spin: number
  idx: number
  ownerId: string
}

/** A dropped oil slick. */
export interface Slick {
  x: number
  y: number
  z: number
  life: number
  arm: number
  ownerId: string
}

/** The slice of race state items read and mutate. */
export interface ItemWorld {
  track: BakedTrack
  karts: Kart[]
  projectiles: Projectile[]
  slicks: Slick[]
}

/** Roll an item for a kart, weighted by how far behind the leader it is. */
export function rollItem(k: Kart, karts: Kart[], trackLength: number, rng: () => number): ItemKind {
  let lead = -Infinity
  for (const o of karts) if (o.progress > lead) lead = o.progress
  const gap = Math.max(0, lead - k.progress)
  // 0 = leading, 1 = roughly a half-lap or more behind.
  const t = clamp(gap / (trackLength * 0.55), 0, 1)
  const w: Record<ItemKind, number> = {
    // a leader mostly pulls the defensive drop (slick); a forward-homing wrench is
    // near-useless in 1st, so it skews to the chasing mid-pack instead
    slick: lerp(0.46, 0.05, t),
    wrench: lerp(0.2, 0.2, t),
    boost: lerp(0.28, 0.32, t),
    triple: lerp(0.05, 0.25, t),
    volt: lerp(0.01, 0.18, t),
  }
  let sum = 0
  for (const key in w) sum += w[key as ItemKind]
  let r = rng() * sum
  for (const key in w) {
    r -= w[key as ItemKind]
    if (r <= 0) return key as ItemKind
  }
  return 'boost'
}

/** Fire the kart's held item. Spawns projectiles/slicks or applies area effects. */
export function useItem(world: ItemWorld, k: Kart, events: RaceEvent[]): void {
  if (!k.item || k.finished) return
  const it = k.item
  const fx = Math.sin(k.heading)
  const fz = Math.cos(k.heading)
  if (it === 'boost' || it === 'triple') {
    applyBoost(k, 1.5, events)
    if (it === 'triple') {
      k.itemCharges = Math.max(0, k.itemCharges - 1)
      if (k.itemCharges > 0) return // keep the item until all three are spent
    }
    k.item = null
    return
  }
  k.item = null
  if (it === 'wrench') {
    world.projectiles.push({
      x: k.x + fx * 2.6,
      y: k.y + 1,
      z: k.z + fz * 2.6,
      heading: k.heading,
      life: 4.5,
      arm: 0.25,
      spin: 0,
      idx: k.idx,
      ownerId: k.id,
    })
    events.push({ kind: 'throw', kartId: k.id, x: k.x, y: k.y + 1, z: k.z })
  } else if (it === 'slick') {
    world.slicks.push({
      x: k.x - fx * 3,
      y: k.y + 0.04,
      z: k.z - fz * 3,
      life: 22,
      arm: 0.6,
      ownerId: k.id,
    })
    events.push({ kind: 'throw', kartId: k.id, x: k.x, y: k.y, z: k.z })
  } else if (it === 'volt') {
    events.push({ kind: 'zap', kartId: k.id })
    for (const o of world.karts) {
      if (o === k || o.finished || o.invulnT > 0 || o.falling) continue
      // Lightning only strikes karts ahead of the caster.
      if (o.progress <= k.progress) continue
      o.shockT = 1.7
      o.speed *= 0.5
      o.evHit++
    }
  }
}

/** Advance projectiles + slicks and resolve their hits. */
export function updateItems(world: ItemWorld, dt: number, events: RaceEvent[]): void {
  const { track, karts, projectiles, slicks } = world
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const s = projectiles[i]!
    s.life -= dt
    s.arm -= dt
    s.spin += dt * 14
    if (s.life <= 0) {
      projectiles.splice(i, 1)
      continue
    }
    // Mild homing toward the nearest kart ahead within a forward cone.
    let best: Kart | null = null
    let bestD = 26
    const fx = Math.sin(s.heading)
    const fz = Math.cos(s.heading)
    for (const k of karts) {
      if (k.id === s.ownerId && s.arm > 0) continue
      if (k.finished || k.invulnT > 0 || k.falling) continue
      const tx = k.x - s.x
      const tz = k.z - s.z
      const dlen = Math.hypot(tx, tz)
      if (dlen > bestD || dlen < 1e-3) continue
      if ((tx / dlen) * fx + (tz / dlen) * fz < 0.55) continue
      best = k
      bestD = dlen
    }
    if (best) {
      const want = Math.atan2(best.x - s.x, best.z - s.z)
      let dd = want - s.heading
      while (dd > Math.PI) dd -= Math.PI * 2
      while (dd < -Math.PI) dd += Math.PI * 2
      s.heading += clamp(dd, -2.4 * dt, 2.4 * dt)
    }
    // faster than a boosting kart (34 * 1.3), or it never catches anyone
    s.x += Math.sin(s.heading) * 47 * dt
    s.z += Math.cos(s.heading) * 47 * dt
    const ns = nearestSample(track, s.x, s.z, s.idx)
    s.idx = ns.idx
    s.y = track.samples[s.idx]!.y + 1
    if (ns.dist > track.roadW * 1.6) {
      projectiles.splice(i, 1)
      continue
    }
    let consumed = false
    for (const k of karts) {
      if (k.id === s.ownerId && s.arm > 0) continue
      if (k.falling) continue
      const dx = k.x - s.x
      const dz = k.z - s.z
      if (dx * dx + dz * dz < 2.1) {
        if (spinout(k, 1, events)) events.push({ kind: 'hit', kartId: k.id, x: s.x, y: s.y, z: s.z })
        consumed = true
        break
      }
    }
    if (consumed) projectiles.splice(i, 1)
  }

  for (let i = slicks.length - 1; i >= 0; i--) {
    const s = slicks[i]!
    s.life -= dt
    s.arm -= dt
    if (s.life <= 0) {
      slicks.splice(i, 1)
      continue
    }
    for (const k of karts) {
      if (k.id === s.ownerId && s.arm > 0) continue
      if (k.slickCd > 0 || k.falling) continue
      const dx = k.x - s.x
      const dz = k.z - s.z
      if (dx * dx + dz * dz < 2.6) {
        if (spinout(k, 0.8, events)) k.slickCd = 1.5
      }
    }
  }
}
