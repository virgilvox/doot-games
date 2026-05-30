import { afterEach, describe, expect, it } from 'vitest'
import { addr } from './addresses'
import { playerId } from './identity'
import type { RelayCallback, RelayClient, RelayValue, Unsubscribe } from './relay'
import { RoomRuntime } from './room'

/**
 * An in-memory relay shared by several clients: persists values, delivers a
 * snapshot to new subscribers (the late-joiner behavior the engine relies on),
 * and broadcasts sets to matching wildcard subscribers.
 */
class FakeHub {
  store = new Map<string, RelayValue>()
  subs = new Set<{ pattern: string; cb: RelayCallback }>()

  set(address: string, value: RelayValue) {
    this.store.set(address, value)
    for (const s of this.subs) {
      if (matches(s.pattern, address)) s.cb(value, address)
    }
  }

  subscribe(pattern: string, cb: RelayCallback): Unsubscribe {
    const entry = { pattern, cb }
    this.subs.add(entry)
    for (const [address, value] of this.store) {
      if (matches(pattern, address)) cb(value, address)
    }
    return () => this.subs.delete(entry)
  }
}

function matches(pattern: string, address: string): boolean {
  const p = pattern.split('/')
  const a = address.split('/')
  if (p.length !== a.length) return false
  return p.every((seg, i) => seg === '*' || seg === a[i])
}

class FakeRelayClient implements RelayClient {
  connected = false
  private connectCbs: Array<() => void> = []
  constructor(private hub: FakeHub) {}
  async connect() {
    this.connected = true
    for (const cb of this.connectCbs) cb()
  }
  on(pattern: string, cb: RelayCallback) {
    return this.hub.subscribe(pattern, cb)
  }
  set(address: string, value: RelayValue) {
    this.hub.set(address, value)
  }
  cached(address: string) {
    return this.hub.store.get(address)
  }
  async get(address: string) {
    return this.hub.store.get(address) as RelayValue
  }
  onConnect(cb: () => void) {
    this.connectCbs.push(cb)
  }
  onDisconnect() {}
  onReconnect() {}
  onError() {}
  close() {}
}

/** Flush pending microtasks + timers so async profile publishing settles. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function makeHost(hub: FakeHub, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: 'ABCD', role: 'host', now })
  cleanups.push(() => r.dispose())
  return r
}
function makePlayer(hub: FakeHub, name: string, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: 'ABCD', role: 'player', name, now })
  cleanups.push(() => r.dispose())
  return r
}

const GAME = {
  meta: {
    pluginId: 'votebox',
    pluginVersion: '0.0.0',
    title: 'Test',
    themeId: 'playful',
  },
  config: { title: 'Test', slides: [{}, {}] } as RelayValue,
  rounds: [{ timer: 20 }, { timer: null }],
  answerKeys: { 0: { correct: 1 } as RelayValue },
}

describe('RoomRuntime host actions', () => {
  it('publishes meta and holds config during the lobby (before start)', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    host.loadGame(GAME)
    // A lobby joiner must be able to learn which game is running, and the host's
    // own config must be present so the UI can enable "Start", both before start().
    expect(hub.store.get(addr.meta('ABCD'))).toEqual(GAME.meta)
    expect(host.getSnapshot().config).toEqual(GAME.config)
    // The config is NOT published to the relay yet (only meta + phase lobby).
    expect(hub.store.get(addr.config('ABCD'))).toBeUndefined()
    expect(hub.store.get(addr.phase('ABCD'))).toBe('lobby')
  })

  it('publishes the start state and walks the round cycle', async () => {
    const hub = new FakeHub()
    let t = 1_000
    const host = makeHost(hub, () => t)
    await host.connect()
    host.loadGame(GAME)

    host.start()
    expect(hub.store.get(addr.phase('ABCD'))).toBe('active')
    expect(hub.store.get(addr.config('ABCD'))).toEqual(GAME.config)
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('ready')

    host.openVoting()
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('open')
    expect(hub.store.get(addr.roundDeadline('ABCD'))).toBe(1_000 + 20 * 1000)

    host.lock()
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('locked')
    expect(hub.store.get(addr.roundDeadline('ABCD'))).toBeNull()

    host.reveal()
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('reveal')
    expect(hub.store.get(addr.roundAnswer('ABCD', 0))).toEqual({ correct: 1 })

    expect(host.can('next')).toBe(true)
    host.next()
    expect(hub.store.get(addr.roundIndex('ABCD'))).toBe(1)
    expect(host.can('next')).toBe(false) // last round

    host.finish({ winner: 'Robin' } as RelayValue)
    expect(hub.store.get(addr.phase('ABCD'))).toBe('results')
    expect(hub.store.get(addr.resultsSummary('ABCD'))).toEqual({ winner: 'Robin' })
  })

  it('auto-locks a timed round when the deadline passes', async () => {
    const hub = new FakeHub()
    let t = 0
    const host = makeHost(hub, () => t)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('open')

    t = 20_001 // past the 20s deadline
    host.tick(t)
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('locked')
  })
})

describe('RoomRuntime host presence', () => {
  it('publishes host liveness and players detect a vanished host', async () => {
    const hub = new FakeHub()
    let t = 1_000
    const host = makeHost(hub, () => t)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    // The host broadcasts a liveness ping (the latest value is its timestamp).
    expect(hub.store.get(addr.hostPing('ABCD'))).toBe(1_000)

    const player = makePlayer(hub, 'Robin', () => t)
    await player.connect()
    await flush()
    // Fresh in a live room: the host reads as present.
    expect(player.getSnapshot().hostPresent).toBe(true)

    // Time advances past the presence window with no new ping (host tab gone).
    t = 1_000 + 17_000
    expect(player.getSnapshot().hostPresent).toBe(false)

    // The host always sees itself as present.
    expect(host.getSnapshot().hostPresent).toBe(true)
  })
})

describe('RoomRuntime runtime-derived content (the two-phase pattern)', () => {
  // A game whose round 1 (vote) content is derived from round 0 (submit) inputs.
  const TWO_PHASE = {
    meta: { pluginId: 'quip-clash', pluginVersion: '0.0.0', title: 'Two phase', themeId: 'doot' },
    config: { title: 'Two phase', rounds: [{}, {}] } as RelayValue,
    rounds: [{ timer: null }, { timer: null }],
    // Build round 1's options from round 0's submissions: shuffle off, anonymize
    // the authors into the published payload, keep the author map as the answer.
    deriveContent: (index: number, inputsFor: (i: number) => Map<string, RelayValue>) => {
      if (index !== 1) return undefined
      const subs = [...inputsFor(0).entries()].map(([pid, v], i) => ({
        pid,
        id: `o${i}`,
        text: (v as { text?: string }).text ?? '',
      }))
      return {
        publish: { options: subs.map((s) => ({ id: s.id, text: s.text })) } as RelayValue,
        answer: { authors: Object.fromEntries(subs.map((s) => [s.id, s.pid])) } as RelayValue,
      }
    },
    revealSummary: (index: number, inputsFor: (i: number) => Map<string, RelayValue>) => {
      if (index !== 1) return undefined
      return { votes: inputsFor(1).size } as RelayValue
    },
  }

  it('derives a later round from earlier inputs, withholds the author map until reveal', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(TWO_PHASE)
    host.start()

    // Round 0: a player submits free text. Nothing derived for round 0.
    const p1 = makePlayer(hub, 'Ada', now)
    await p1.connect()
    await flush()
    p1.submit({ text: 'banana' } as RelayValue)
    expect(hub.store.get(addr.roundContent('ABCD', 1))).toBeUndefined()

    // Host walks round 0 to its end, then advances to the derived vote round.
    host.openVoting()
    host.lock()
    host.reveal()
    host.next()

    // The anonymized options are now on the relay; the author map is NOT.
    const pid = playerId('ABCD', 'Ada')
    expect(hub.store.get(addr.roundContent('ABCD', 1))).toEqual({
      options: [{ id: 'o0', text: 'banana' }],
    })
    expect(hub.store.get(addr.roundContent('ABCD', 1))).not.toHaveProperty('authors')
    // The host keeps the withheld author map locally for scoring.
    expect(host.answerKeyFor(1)).toEqual({ authors: { o0: pid } })
    // It is not published until reveal.
    expect(hub.store.get(addr.roundAnswer('ABCD', 1))).toBeUndefined()

    // A player sees the derived content via subscription, but not the author map.
    const voter = makePlayer(hub, 'Bee', now)
    await voter.connect()
    await flush()
    expect(voter.runtimeContentFor(1)).toEqual({ options: [{ id: 'o0', text: 'banana' }] })

    // Reveal publishes the author map and the public reveal summary.
    voter.submit({ choice: 'o0' } as RelayValue)
    host.openVoting()
    host.lock()
    host.reveal()
    expect(hub.store.get(addr.roundAnswer('ABCD', 1))).toEqual({ authors: { o0: pid } })
    expect(hub.store.get(addr.roundReveal('ABCD', 1))).toEqual({ votes: 1 })
    expect(voter.roundRevealFor(1)).toEqual({ votes: 1 })
  })

  it('restores derived vote content and the players own prior submission on reconnect', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(TWO_PHASE)
    host.start()

    const p1 = makePlayer(hub, 'Ada', now)
    await p1.connect()
    await flush()
    p1.submit({ text: 'banana' } as RelayValue)

    // Advance to the derived vote round (host publishes the runtime content).
    host.openVoting()
    host.lock()
    host.reveal()
    host.next()
    expect(hub.store.get(addr.roundContent('ABCD', 1))).toEqual({ options: [{ id: 'o0', text: 'banana' }] })

    // Ada reconnects mid-vote-round (new runtime, same name) and must recover both
    // the derived options (to vote) and her own quip (to hide her own answer).
    const p2 = makePlayer(hub, 'Ada', now)
    await p2.connect()
    await flush()
    expect(p2.me.id).toBe(p1.me.id)
    expect(p2.runtimeContentFor(1)).toEqual({ options: [{ id: 'o0', text: 'banana' }] })
    expect(p2.inputFor(0)).toEqual({ text: 'banana' })
  })
})

describe('RoomRuntime host + player over a shared relay', () => {
  it('registers a late joiner, restores eligibility, and routes inputs', async () => {
    const hub = new FakeHub()
    const now = () => 5_000
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()

    // A player joins mid-round (state 'open') -> eligible from round 0.
    const player = makePlayer(hub, 'Robin', now)
    await player.connect()
    await flush() // the profile publish round-trips through relay.get()

    const pid = playerId('ABCD', 'Robin')
    expect(player.joinedAtIndex).toBe(0)
    expect(hub.store.get(addr.playerProfile('ABCD', pid))).toEqual({ name: 'Robin', joinedAtIndex: 0 })

    // The host sees the player in its roster (heartbeat published on join).
    expect(host.recentPlayers().map((p) => p.name)).toContain('Robin')

    // The player submits; the host aggregates it for the round.
    player.submit({ choice: 1 } as RelayValue)
    expect(player.inputFor(0)).toEqual({ choice: 1 })
    expect(host.inputsFor(0).get(pid)).toEqual({ choice: 1 })
  })

  it('reclaims identity, join index, and inputs on reconnect by name', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    // Sam joins while round 0 is still open -> eligible from round 0.
    const p1 = makePlayer(hub, 'Sam', now)
    await p1.connect()
    await flush()
    expect(p1.joinedAtIndex).toBe(0)
    p1.submit({ choice: 0 } as RelayValue)

    // The host advances past round 0. A *fresh* joiner now would be deferred to
    // round 1 (state is locked), so this distinguishes reconnect from re-join.
    host.openVoting()
    host.lock()

    const p2 = makePlayer(hub, 'Sam', now)
    await p2.connect()
    await flush()
    expect(p2.me.id).toBe(p1.me.id)
    expect(p2.joinedAtIndex).toBe(0) // kept the original, not recomputed to 1
    expect(p2.inputFor(0)).toEqual({ choice: 0 })
  })
})
