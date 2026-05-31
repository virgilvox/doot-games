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
  /** Addresses passed to get(), so a test can assert the lobby fast path skips reads. */
  getCalls: string[] = []
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
    this.getCalls.push(address)
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

describe('RoomRuntime join presence (A3)', () => {
  it('shows a joiner in the roster from the profile alone, before any ping arrives', async () => {
    const hub = new FakeHub()
    let t = 1_000
    const host = makeHost(hub, () => t)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    // Simulate a profile landing on the relay with no heartbeat yet (the gap the
    // bug left a player invisible in). The host must already roster them.
    const pid = playerId('ABCD', 'Quinn')
    hub.set(addr.playerProfile('ABCD', pid), { name: 'Quinn', joinedAtIndex: 0 })
    expect(host.recentPlayers().map((p) => p.name)).toContain('Quinn')

    // ...but a profile-only player still ages out after one presence window if no
    // real ping ever follows (the seed is a one-window grace, not permanent).
    t = 1_000 + 21_000
    expect(host.recentPlayers().map((p) => p.name)).not.toContain('Quinn')
  })

  it('does not resurrect a stale-ping player when their profile re-publishes', async () => {
    const hub = new FakeHub()
    let t = 1_000
    const host = makeHost(hub, () => t)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    const pid = playerId('ABCD', 'Robin')
    // A real (now stale) ping was seen earlier.
    hub.set(addr.playerPing('ABCD', pid), 1_000)
    t = 1_000 + 25_000 // past the presence window
    // The profile re-publishes (e.g. a dead tab's retained value re-delivered).
    hub.set(addr.playerProfile('ABCD', pid), { name: 'Robin', joinedAtIndex: 0 })
    // The prior (stale) ping is kept, so they stay aged out rather than flashing back.
    expect(host.recentPlayers().map((p) => p.name)).not.toContain('Robin')
  })

  it('publishes a lobby joiner immediately, without waiting on authoritative reads', async () => {
    const hub = new FakeHub()
    const now = () => 5_000
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    // No start(): the room stays in the lobby, the common party case.

    const relay = new FakeRelayClient(hub)
    const player = new RoomRuntime({ relay, room: 'ABCD', role: 'player', name: 'Lobby', now })
    cleanups.push(() => player.dispose())
    await player.connect()
    await flush()

    const pid = playerId('ABCD', 'Lobby')
    expect(player.joinedAtIndex).toBe(0)
    expect(hub.store.get(addr.playerProfile('ABCD', pid))).toEqual({ name: 'Lobby', joinedAtIndex: 0 })
    // The fast path skips the four authoritative reads entirely in the lobby.
    expect(relay.getCalls).toHaveLength(0)
    // And the host rosters them at once.
    expect(host.recentPlayers().map((p) => p.name)).toContain('Lobby')
  })
})

describe('RoomRuntime.probePresence (A5)', () => {
  it('reports not present when no profile or ping exists (join allowed)', async () => {
    const hub = new FakeHub()
    const relay = new FakeRelayClient(hub)
    const res = await RoomRuntime.probePresence(relay, 'ABCD', 'Newbie', () => 1_000)
    expect(res.present).toBe(false)
    expect(res.hasProfile).toBe(false)
    expect(res.id).toBe(playerId('ABCD', 'Newbie'))
  })

  it('reports not present for a profile with a stale ping (a genuine reconnect)', async () => {
    const hub = new FakeHub()
    const pid = playerId('ABCD', 'Sam')
    hub.set(addr.playerProfile('ABCD', pid), { name: 'Sam', joinedAtIndex: 0 })
    hub.set(addr.playerPing('ABCD', pid), 1_000)
    const relay = new FakeRelayClient(hub)
    // now is well past the presence window since the last ping.
    const res = await RoomRuntime.probePresence(relay, 'ABCD', 'Sam', () => 1_000 + 60_000)
    expect(res.present).toBe(false)
    expect(res.hasProfile).toBe(true)
  })

  it('reports present for a profile with a fresh ping (a live collision)', async () => {
    const hub = new FakeHub()
    const pid = playerId('ABCD', 'Sam')
    hub.set(addr.playerProfile('ABCD', pid), { name: 'Sam', joinedAtIndex: 0 })
    hub.set(addr.playerPing('ABCD', pid), 9_000)
    const relay = new FakeRelayClient(hub)
    const res = await RoomRuntime.probePresence(relay, 'ABCD', 'Sam', () => 10_000)
    expect(res.present).toBe(true)
  })

  it('normalizes the name so a casing variant maps to the same live identity', async () => {
    const hub = new FakeHub()
    const pid = playerId('ABCD', 'Robin')
    hub.set(addr.playerProfile('ABCD', pid), { name: 'Robin', joinedAtIndex: 0 })
    hub.set(addr.playerPing('ABCD', pid), 9_500)
    const relay = new FakeRelayClient(hub)
    const res = await RoomRuntime.probePresence(relay, 'ABCD', '  robin ', () => 10_000)
    expect(res.id).toBe(pid)
    expect(res.present).toBe(true)
  })

  it('fails open: a rejecting relay.get reports not present (never blocks a join)', async () => {
    const hub = new FakeHub()
    const relay = new FakeRelayClient(hub)
    relay.get = () => Promise.reject(new Error('relay down'))
    const res = await RoomRuntime.probePresence(relay, 'ABCD', 'Anyone', () => 1_000)
    expect(res.present).toBe(false)
    expect(res.hasProfile).toBe(false)
  })

  it('does not hang on an absent key: a never-answering get times out to not-present', async () => {
    const hub = new FakeHub()
    const relay = new FakeRelayClient(hub)
    // The real relay does not answer "absent" quickly for a missing key, it hangs
    // until its own multi-second timeout. Model that, and assert the probe still
    // resolves promptly (via the short internal timeout) rather than waiting.
    relay.get = () => new Promise<RelayValue>(() => {})
    const res = await RoomRuntime.probePresence(relay, 'ABCD', 'Ghost', () => 1_000, 20)
    expect(res.present).toBe(false)
    expect(res.hasProfile).toBe(false)
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
