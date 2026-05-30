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
    // own config must be present so the UI can enable "Start" — both before start().
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
