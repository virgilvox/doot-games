import { describe, expect, it } from 'vitest'
import { bakeMap, getMap, MAPS } from './maps'
import { resolveKart, statBars } from './roster'
import { bakeTrack } from './sim/track'
import {
  applyBoost,
  blendStats,
  fmtTime,
  type ItemWorld,
  makeRng,
  ord,
  PHYS,
  pointsForPlace,
  Race,
  rollItem,
  stepKart,
  tallyCup,
  useItem,
} from './logic'
import type { BakedTrack, ItemKind, Kart } from './sim/types'

const seed = 'TEST'

describe('track baking', () => {
  it('bakes every map into a closed, arc-length-even loop', () => {
    for (const map of MAPS) {
      const t = bakeMap(map.id, seed)
      expect(t.n).toBe(900)
      expect(t.samples.length).toBe(900)
      expect(t.length).toBeGreaterThan(100)
      // cumulative arc length strictly increases (monotone) along the loop
      for (let i = 1; i < t.n; i++) expect(t.samples[i].s).toBeGreaterThan(t.samples[i - 1].s)
      // checkpoint 0 is the finish line
      expect(t.checkpoints[0].index).toBe(t.finishIndex)
      // tangents + rights are unit length
      const sm = t.samples[10]
      expect(Math.hypot(sm.dx, sm.dz)).toBeCloseTo(1, 3)
      expect(Math.hypot(sm.rx, sm.rz)).toBeCloseTo(1, 3)
    }
  })

  it('places every collidable prop off the road (the cactus you see is the one you hit, never on the track)', () => {
    const t = bakeMap('kiln', seed)
    expect(t.obstacles.length).toBeGreaterThan(20)
    for (const o of t.obstacles) {
      // distance from obstacle centre to nearest centerline sample
      let best = Infinity
      for (let i = 0; i < t.n; i += 3) {
        const d = Math.hypot(o.x - t.samples[i].x, o.z - t.samples[i].z)
        if (d < best) best = d
      }
      expect(best).toBeGreaterThan(t.roadW / 2)
    }
  })

  it('is deterministic given a seed (reconnect-safe scatter)', () => {
    const a = bakeMap('kiln', seed)
    const b = bakeMap('kiln', seed)
    expect(a.obstacles.length).toBe(b.obstacles.length)
    expect(a.obstacles[0]).toEqual(b.obstacles[0])
  })
})

describe('full race simulation', () => {
  function runRace(laps: number): Race {
    const track = bakeMap('kiln', seed)
    const race = new Race(track, { laps, totalRacers: 6, seed })
    for (let i = 0; i < 6; i++) {
      const r = resolveKart('socket', 'standard')
      race.addKart(
        { id: `cpu${i}`, charId: 'socket', cartId: 'standard', name: `CPU${i}`, human: false, stats: r.stats, paint: r.paint },
        i,
      )
    }
    race.startCountdown()
    const dt = 1 / 60
    for (let step = 0; step < 60 * 200 && race.state !== 'finish'; step++) race.step(dt)
    return race
  }

  it('runs a clean Grand Prix race to a finish with unique places', () => {
    const race = runRace(2)
    expect(race.state).toBe('finish')
    const places = race.karts.map((k) => k.place).sort((a, b) => a - b)
    expect(places).toEqual([1, 2, 3, 4, 5, 6])
    // the winner actually completed the laps (lap counter passes the lap total)
    const winner = race.karts.find((k) => k.place === 1)!
    expect(winner.lap).toBeGreaterThan(2)
  })

  it('karts make real forward progress (no one is stuck on the grid)', () => {
    const race = runRace(2)
    for (const k of race.karts) expect(k.progress).toBeGreaterThan(race.track.length)
  })
})

describe('lap counting cannot be cheated by reversing', () => {
  it('does not credit a lap when a kart crosses the finish line backwards / out of order', () => {
    const track = bakeMap('kiln', seed)
    const race = new Race(track, { laps: 3, totalRacers: 1, seed })
    const r = resolveKart('socket', 'standard')
    const k = race.addKart(
      { id: 'solo', charId: 'socket', cartId: 'standard', name: 'SOLO', human: true, stats: r.stats, paint: r.paint },
      0,
    )
    race.startCountdown()
    // drive backwards: full brake/reverse, no gas
    k.input.gas = 0
    k.input.brake = 1
    for (let step = 0; step < 60 * 10; step++) race.step(1 / 60)
    // Crossing the start line in reverse must not advance the lap (expected gate is cp1, not cp0).
    expect(k.lap).toBeLessThanOrEqual(1)
    expect(k.finished).toBe(false)
  })
})

describe('item distribution by race position (research: catch-up power to the back)', () => {
  it('hands the leader defensive items and trailers the power items', () => {
    const trackLen = 1000
    const leader: Pick<Kart, 'progress'> = { progress: 950 }
    const trailer: Pick<Kart, 'progress'> = { progress: 0 }
    const karts = [leader, trailer] as Kart[]
    const rng = makeRng('items')
    const count: Record<'leader' | 'trailer', Record<ItemKind, number>> = {
      leader: { boost: 0, wrench: 0, slick: 0, volt: 0, triple: 0 },
      trailer: { boost: 0, wrench: 0, slick: 0, volt: 0, triple: 0 },
    }
    for (let i = 0; i < 4000; i++) {
      count.leader[rollItem(leader as Kart, karts, trackLen, rng)]++
      count.trailer[rollItem(trailer as Kart, karts, trackLen, rng)]++
    }
    const leaderPower = count.leader.volt + count.leader.triple
    const trailerPower = count.trailer.volt + count.trailer.triple
    expect(trailerPower).toBeGreaterThan(leaderPower * 2)
    // the leader is far more likely to pull a defensive slick than the back marker
    expect(count.leader.slick).toBeGreaterThan(count.trailer.slick)
    // lightning (volt) almost never reaches the leader
    expect(count.leader.volt).toBeLessThan(count.trailer.volt)
  })
})

describe('grand prix standings', () => {
  it('awards the MK8 points table', () => {
    expect(pointsForPlace(1)).toBe(15)
    expect(pointsForPlace(2)).toBe(12)
    expect(pointsForPlace(12)).toBe(1)
    expect(pointsForPlace(13)).toBe(0)
  })

  it('accumulates a cup and breaks ties by the most recent race', () => {
    const mk = (id: string, place: number) => ({ id, name: id, charId: 'socket', cartId: 'standard', paint: 0, place })
    let cup = tallyCup([], [mk('a', 1), mk('b', 2)])
    cup = tallyCup(cup, [mk('a', 2), mk('b', 1)])
    // a: 15+12 = 27, b: 12+15 = 27 -> tie, broken by better LAST place (b won race 2)
    expect(cup[0].id).toBe('b')
    expect(cup[0].points).toBe(27)
    expect(cup[1].points).toBe(27)
  })
})

describe('stat blending', () => {
  it('blends driver + vehicle biases and clamps to a sane band', () => {
    const s = blendStats({ topSpeed: 1.06 }, { topSpeed: 1.1, weight: 1.12 })
    expect(s.topSpeed).toBeCloseTo(1.16, 2)
    expect(s.weight).toBeCloseTo(1.12, 2)
    // never out of band
    const wild = blendStats({ topSpeed: 1.5 }, { topSpeed: 1.5 })
    expect(wild.topSpeed).toBeLessThanOrEqual(1.28)
    expect(statBars(s).length).toBe(5)
  })
})

describe('formatting helpers', () => {
  it('formats ordinals and times', () => {
    expect(ord(1)).toBe('1ST')
    expect(ord(2)).toBe('2ND')
    expect(ord(4)).toBe('4TH')
    expect(ord(11)).toBe('11TH')
    expect(fmtTime(83400)).toBe('1:23.4')
  })
})

describe('map registry', () => {
  it('exposes five distinct courses with valid track defs', () => {
    expect(MAPS.length).toBe(5)
    expect(getMap('prism').track.voidFall).toBe(true)
    expect(getMap('nope').id).toBe(MAPS[0].id) // fallback
    expect(bakeTrack(getMap('sprue').track, seed).n).toBe(900)
  })
})

// A wide, flat, barrier-free oval so a kart can drive + drift freely with no walls,
// off-road edges, or void to disturb a pure-physics assertion.
function arena(): { track: BakedTrack; race: Race; kart: (id: string, cart?: string, gi?: number) => Kart } {
  const track = bakeTrack(
    { control: [[-220, 0, -160], [220, 0, -160], [220, 0, 160], [-220, 0, 160]], roadW: 60, voidFall: false, barrier: 'none' },
    'arena',
  )
  const race = new Race(track, { laps: 3, totalRacers: 8, seed: 'arena' })
  let n = 0
  const kart = (id: string, cart = 'standard', gi = n++): Kart => {
    const r = resolveKart('socket', cart)
    return race.addKart({ id, charId: 'socket', cartId: cart, name: id, human: true, stats: r.stats, paint: r.paint }, gi)
  }
  return { track, race, kart }
}

describe('drift mini-turbo', () => {
  it('charges through all three tiers and pays out a boost on release', () => {
    const { track, kart } = arena()
    const k = kart('drifter-test', 'drifter')
    const ev: ReturnType<Race['drainEvents']> = []
    k.input.gas = 1
    for (let i = 0; i < 90; i++) stepKart(track, k, 1 / 60, true, ev) // build speed
    expect(k.speed).toBeGreaterThan(15)
    // hold drift + steer; charge to the top tier
    k.input.drift = 1
    k.input.steer = 0.6
    let topTier = 0
    for (let i = 0; i < 360 && topTier < 3; i++) {
      stepKart(track, k, 1 / 60, true, ev)
      topTier = Math.max(topTier, k.driftTier)
    }
    expect(topTier).toBe(3)
    // releasing the drift pays out a boost
    k.input.drift = 0
    stepKart(track, k, 1 / 60, true, ev)
    expect(k.boostT).toBeGreaterThan(0)
    // a lower tier pays less than a higher tier
    expect(PHYS.driftPay[0]).toBeLessThan(PHYS.driftPay[2]!)
  })
})

describe('kart-vs-kart collision', () => {
  it('pushes overlapping karts apart, displacing the lighter one more', () => {
    const { race, kart } = arena()
    const heavy = kart('heavy', 'hauler') // weight ~1.16
    const light = kart('light', 'scooter') // weight ~0.86
    race.startCountdown()
    for (let i = 0; i < 200 && race.state !== 'race'; i++) race.step(1 / 60) // clear countdown
    // overlap them at the same spot, at rest
    heavy.x = 0
    heavy.z = 0
    heavy.speed = 0
    light.x = 0.3
    light.z = 0
    light.speed = 0
    race.step(1 / 60)
    const gap = Math.hypot(light.x - heavy.x, light.z - heavy.z)
    expect(gap).toBeGreaterThan(0.5) // separated
    // the lighter kart was shoved further from the origin than the heavier one
    expect(Math.abs(light.x)).toBeGreaterThan(Math.abs(heavy.x))
  })
})

describe('item effects', () => {
  function world(): { w: ItemWorld; karts: Kart[] } {
    const { race, kart } = arena()
    const lead = kart('lead')
    const mid = kart('mid')
    const back = kart('back')
    lead.progress = 1000
    mid.progress = 500
    back.progress = 0
    const w: ItemWorld = { track: race.track, karts: race.karts, projectiles: race.projectiles, slicks: race.slicks }
    return { w, karts: [lead, mid, back] }
  }

  it('volt only strikes karts ahead of the caster', () => {
    const { w, karts } = world()
    const [lead, mid, back] = karts
    mid!.item = 'volt'
    useItem(w, mid!, [])
    expect(lead!.shockT).toBeGreaterThan(0) // ahead -> struck
    expect(back!.shockT).toBe(0) // behind -> spared
    expect(mid!.shockT).toBe(0) // the caster -> spared
  })

  it('triple keeps the item until all three boosts are spent', () => {
    const { karts } = world()
    const k = karts[2]!
    const w: ItemWorld = { track: bakeTrack({ control: [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]], roadW: 20, voidFall: false, barrier: 'none' }, 's'), karts, projectiles: [], slicks: [] }
    k.item = 'triple'
    k.itemCharges = 3
    useItem(w, k, [])
    expect(k.item).toBe('triple')
    expect(k.itemCharges).toBe(2)
    useItem(w, k, [])
    useItem(w, k, [])
    expect(k.item).toBe(null) // all three spent
  })

  it('applyBoost refreshes rather than stacks', () => {
    const { karts } = world()
    const k = karts[0]!
    k.boostT = 1
    applyBoost(k, 0.5, []) // shorter -> no change
    expect(k.boostT).toBe(1)
    applyBoost(k, 2, []) // longer -> refreshed
    expect(k.boostT).toBe(2)
  })
})
