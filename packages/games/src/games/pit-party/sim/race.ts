/**
 * The authoritative race orchestrator. Owns the world (karts, projectiles, oil,
 * item boxes), runs the per-frame step (AI -> items -> motion -> collisions ->
 * pickups -> ranking), and surfaces discrete events for the renderer/audio. Pure
 * and deterministic given the same inputs + seed, so it could later run headless
 * for authoritative netcode.
 */
import { aiThink, aiUseItem, makeAi } from './ai'
import { type ItemWorld, type Projectile, type Slick, rollItem, updateItems, useItem } from './items'
import { stepKart } from './physics'
import type { BakedTrack, Kart, KartStats, RaceEvent } from './types'
import { emptyInput } from './types'
import { clamp, headingOf, lerp, makeRng } from './vec'

export type RaceState = 'grid' | 'count' | 'race' | 'finish'

export interface KartSpec {
  id: string
  charId: string
  cartId: string
  name: string
  human: boolean
  stats: KartStats
  paint: number
}

/** Item box: position + whether it's currently grabbable + an animation/respawn clock. */
export interface ItemBox {
  x: number
  y: number
  z: number
  active: boolean
  t: number
}

const RESPAWN_BOX = 3 // seconds an emptied item box stays gone
const COUNT_SECS = 3
const GHOST_TIMEOUT_MS = 15000 // race ends this long after the first finisher

export class Race {
  readonly track: BakedTrack
  readonly laps: number
  readonly totalRacers: number
  karts: Kart[] = []
  projectiles: Projectile[] = []
  slicks: Slick[] = []
  boxes: ItemBox[]
  state: RaceState = 'grid'
  countT = 0
  raceTime = 0 // ms since GO
  finishCount = 0
  firstFinishAt = 0 // ms
  private events: RaceEvent[] = []
  private rng: () => number
  private world: ItemWorld

  constructor(track: BakedTrack, opts: { laps: number; totalRacers: number; seed: string }) {
    this.track = track
    this.laps = opts.laps
    this.totalRacers = opts.totalRacers
    this.rng = makeRng(`race:${opts.seed}`)
    this.boxes = track.itemBoxes.map((b) => ({ x: b.x, y: b.y, z: b.z, active: true, t: this.rng() * 6 }))
    this.world = { track, karts: this.karts, projectiles: this.projectiles, slicks: this.slicks }
  }

  /** Place a kart on the starting grid by its 0-based grid slot. */
  addKart(spec: KartSpec, gridIdx: number): Kart {
    const { samples, n, finishIndex } = this.track
    const row = gridIdx >> 1
    const lane = gridIdx % 2 ? 2.5 : -2.5
    const si = ((finishIndex - 9 - row * 8) % n + n) % n
    const sm = samples[si]!
    const k: Kart = {
      id: spec.id,
      charId: spec.charId,
      cartId: spec.cartId,
      name: spec.name,
      human: spec.human,
      stats: spec.stats,
      paint: spec.paint,
      x: sm.x + sm.rx * lane,
      y: sm.y,
      z: sm.z + sm.rz * lane,
      heading: headingOf(sm.dx, sm.dz),
      speed: 0,
      idx: si,
      lap: 1,
      nextCp: 1,
      progress: 0,
      rank: gridIdx + 1,
      offroad: false,
      wrongT: 0,
      drifting: false,
      driftDir: 0,
      driftCharge: 0,
      driftTier: 0,
      boostT: 0,
      spinT: 0,
      spinDir: 1,
      shockT: 0,
      invulnT: 0,
      slickCd: 0,
      wallCd: 0,
      bumpCd: 0,
      falling: false,
      fallT: 0,
      fallVy: 0,
      lastCp: 0,
      item: null,
      itemCharges: 0,
      finished: false,
      place: 0,
      finishTime: 0,
      lastLapAt: 0,
      steerVis: 0,
      wheelSpin: 0,
      evHit: 0,
      evPick: 0,
      evBoost: 0,
      ai: spec.human ? null : makeAi(this.aiTargetPlace(gridIdx), this.rng),
      input: emptyInput(),
    }
    this.karts.push(k)
    return k
  }

  /** A CPU's rubber-band target: front CPUs aim high, back CPUs aim low. */
  private aiTargetPlace(gridIdx: number): number {
    return clamp(gridIdx <= 1 ? 1 + gridIdx : 3 + (gridIdx % 4), 1, this.totalRacers)
  }

  /** Convert a dropped human's kart into a CPU ghost so the race keeps flowing. */
  handToCpu(id: string): void {
    const k = this.getKart(id)
    if (!k) return
    k.human = false
    k.ai = makeAi(Math.max(1, k.rank), this.rng)
    k.input = emptyInput()
  }

  /** Hand a CPU kart back to a reconnected human. */
  seatHuman(id: string, name: string): void {
    const k = this.getKart(id)
    if (!k) return
    k.human = true
    k.ai = null
    k.name = name
    k.input = emptyInput()
  }

  getKart(id: string): Kart | undefined {
    return this.karts.find((k) => k.id === id)
  }

  startCountdown(): void {
    this.state = 'count'
    this.countT = 0
    this.raceTime = 0
    this.finishCount = 0
    this.firstFinishAt = 0
  }

  /** Advance the simulation by `dt` seconds. */
  step(dt: number): void {
    const d = clamp(dt, 0, 0.05)
    this.animateBoxes(d)

    if (this.state === 'count') {
      this.countT += d
      if (this.countT >= COUNT_SECS) {
        this.state = 'race'
        this.raceTime = 0
      }
    }
    const racing = this.state === 'race'

    // AI think + item use; humans' input is already set by the host.
    for (const k of this.karts) {
      if (k.ai) {
        aiThink(this.track, k, this.karts, racing, d, this.rng)
        if (racing) aiUseItem(this.world, k, d, this.rng, this.events)
      } else if (racing && k.input.itemQueued) {
        useItem(this.world, k, this.events)
        k.input.itemQueued = false
      }
    }

    // Motion + per-kart progress.
    for (const k of this.karts) {
      const prevLap = k.lap
      stepKart(this.track, k, d, racing, this.events)
      if (racing && k.lap !== prevLap && !k.finished) this.onLap(k)
    }

    if (racing) {
      updateItems(this.world, d, this.events)
      this.kartCollisions()
      this.pickups()
      this.raceTime += d * 1000
    }

    this.updateRanks()

    if (racing) this.checkRaceEnd()
  }

  private onLap(k: Kart): void {
    if (k.lap > this.laps) {
      this.finishKart(k)
      return
    }
    k.lastLapAt = this.raceTime
    this.events.push({ kind: k.lap === this.laps ? 'finalLap' : 'lap', kartId: k.id })
  }

  private finishKart(k: Kart): void {
    k.finished = true
    k.place = ++this.finishCount
    k.finishTime = this.raceTime
    if (!this.firstFinishAt) this.firstFinishAt = this.raceTime
    // Keep the kart driving as a ghost so the track stays lively.
    if (k.human) k.ai = makeAi(this.totalRacers, this.rng)
    this.events.push({ kind: 'finish', kartId: k.id, place: k.place })
  }

  private checkRaceEnd(): void {
    const realHumans = this.karts.filter((k) => k.human)
    const allHumansDone = realHumans.length > 0 && realHumans.every((h) => h.finished)
    const timerUp = this.firstFinishAt > 0 && this.raceTime - this.firstFinishAt > GHOST_TIMEOUT_MS
    const ghostDone = realHumans.length === 0 && this.karts.length > 0 && this.karts.every((k) => k.finished)
    if (allHumansDone || timerUp || ghostDone) this.endRace()
  }

  /** Assign remaining places (by progress) and freeze the standings. */
  endRace(): void {
    this.state = 'finish'
    this.updateRanks()
    const rest = this.karts.filter((k) => !k.finished).sort((a, b) => b.progress - a.progress)
    for (const k of rest) {
      k.place = ++this.finishCount
      k.finished = true
      if (!k.finishTime) k.finishTime = 0
    }
  }

  /** Karts sorted by final / current place. */
  results(): Kart[] {
    return [...this.karts].sort((a, b) => (a.finished && b.finished ? a.place - b.place : a.rank - b.rank))
  }

  private updateRanks(): void {
    const order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place
      if (a.finished) return -1
      if (b.finished) return 1
      return b.progress - a.progress
    })
    order.forEach((k, i) => {
      k.rank = i + 1
    })
  }

  private kartCollisions(): void {
    const ks = this.karts
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i]!
        const b = ks[j]!
        if (a.falling || b.falling) continue
        const dx = b.x - a.x
        const dz = b.z - a.z
        const d2 = dx * dx + dz * dz
        if (d2 > 4.6 || d2 < 1e-6) continue
        const dd = Math.sqrt(d2)
        const nx = dx / dd
        const nz = dz / dd
        const push = (2.15 - dd) / 2
        // Heavier karts hold their ground; lighter ones get shoved more.
        const wa = a.stats.weight
        const wb = b.stats.weight
        const total = wa + wb
        a.x -= nx * push * ((2 * wb) / total)
        a.z -= nz * push * ((2 * wb) / total)
        b.x += nx * push * ((2 * wa) / total)
        b.z += nz * push * ((2 * wa) / total)
        const avg = (a.speed + b.speed) / 2
        const rel = Math.abs(a.speed - b.speed)
        a.speed = lerp(a.speed, avg, 0.25)
        b.speed = lerp(b.speed, avg, 0.25)
        if (rel > 8 && a.bumpCd <= 0 && b.bumpCd <= 0) {
          a.bumpCd = b.bumpCd = 0.35
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2 + 0.5
          const mz = (a.z + b.z) / 2
          this.events.push({ kind: 'bump', kartId: a.id, x: mx, y: my, z: mz })
        }
      }
    }
  }

  private pickups(): void {
    for (const box of this.boxes) {
      if (!box.active) continue
      for (const k of this.karts) {
        if (k.item || k.finished || k.falling) continue
        const dx = k.x - box.x
        const dz = k.z - box.z
        if (dx * dx + dz * dz < 2.9) {
          box.active = false
          box.t = 0
          const item = rollItem(k, this.karts, this.track.length, this.rng)
          k.item = item
          if (item === 'triple') k.itemCharges = 3
          k.evPick++
          this.events.push({ kind: 'pick', kartId: k.id })
          break
        }
      }
    }
  }

  private animateBoxes(dt: number): void {
    for (const box of this.boxes) {
      box.t += dt
      if (!box.active && box.t > RESPAWN_BOX) {
        box.active = true
        box.t = 0
      }
    }
  }

  /** Drain accumulated one-frame events (the host reads these for SFX/haptics). */
  drainEvents(): RaceEvent[] {
    if (this.events.length === 0) return []
    const out = this.events
    this.events = []
    return out
  }
}
