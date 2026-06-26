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
function makeAudience(hub: FakeHub, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: 'ABCD', role: 'audience', now })
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

  it('sizes the deadline from timerFor with the runtime-derived content (read-time scaling)', async () => {
    const hub = new FakeHub()
    const t = 1_000
    const host = makeHost(hub, () => t)
    await host.connect()
    host.loadGame({
      ...GAME,
      // Round 0 derives its content at runtime (a judge gallery built from the
      // room's submissions); the dynamic timer must read THAT content, not the
      // static per-round timing (which says 20s).
      deriveContent: (index: number) =>
        index === 0 ? { publish: { options: ['a', 'b', 'c'] } as RelayValue } : undefined,
      timerFor: (index: number, content: RelayValue | undefined) => {
        if (index !== 0) return null
        const n = (content as { options?: string[] } | undefined)?.options?.length ?? 0
        return 20 + n * 10 // 3 derived options -> a 50s window
      },
    })
    host.start() // landing on round 0 publishes its derived content
    host.openVoting()
    expect(hub.store.get(addr.roundDeadline('ABCD'))).toBe(1_000 + 50 * 1000)
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

describe('RoomRuntime player cap (A8)', () => {
  it('stamps a player cap into meta and republishes it, and clears it', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    host.loadGame(GAME)

    host.setPlayerCap(8)
    expect((hub.store.get(addr.meta('ABCD')) as { playerCap?: number }).playerCap).toBe(8)

    host.setPlayerCap(null)
    expect((hub.store.get(addr.meta('ABCD')) as { playerCap?: number }).playerCap).toBeUndefined()
  })

  it('counts only live players for the soft-cap join probe, ignoring stale pings', async () => {
    const hub = new FakeHub()
    const t = 30_000
    hub.set(addr.playerPing('ABCD', playerId('ABCD', 'Live1')), 30_000)
    hub.set(addr.playerPing('ABCD', playerId('ABCD', 'Live2')), 29_000)
    hub.set(addr.playerPing('ABCD', playerId('ABCD', 'Gone')), 1_000) // older than the window
    const relay = new FakeRelayClient(hub)
    const count = await RoomRuntime.probeLiveCount(relay, 'ABCD', () => t, 5)
    expect(count).toBe(2)
  })

  it('probeLiveCount resolves 0 when subscribing throws (fail-open)', async () => {
    const hub = new FakeHub()
    const relay = new FakeRelayClient(hub)
    relay.on = () => {
      throw new Error('relay down')
    }
    const count = await RoomRuntime.probeLiveCount(relay, 'ABCD', () => 1_000, 5)
    expect(count).toBe(0)
  })
})

describe('RoomRuntime sessions (nextGame)', () => {
  const GAME2 = {
    meta: { pluginId: 'guess', pluginVersion: '0.0.0', title: 'Game 2', themeId: 'doot' },
    config: { title: 'Game 2', rounds: [{}] } as RelayValue,
    rounds: [{ timer: null }],
    answerKeys: { 0: { correct: 0 } as RelayValue },
  }

  it('swaps in the next game, re-enters active at round 0, and republishes meta', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()
    host.lock()
    host.reveal()
    host.finish({ winner: 'x' } as RelayValue)
    expect(hub.store.get(addr.phase('ABCD'))).toBe('results')

    host.nextGame(GAME2)
    expect(hub.store.get(addr.meta('ABCD'))).toEqual(GAME2.meta)
    expect(hub.store.get(addr.config('ABCD'))).toEqual(GAME2.config)
    expect(hub.store.get(addr.phase('ABCD'))).toBe('active')
    expect(hub.store.get(addr.roundIndex('ABCD'))).toBe(0)
    expect(hub.store.get(addr.roundState('ABCD'))).toBe('ready')
    expect(host.getSnapshot().round.index).toBe(0)
  })

  it('wipes the previous game\'s inputs so a reused round index does not inherit them', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()

    const ada = makePlayer(hub, 'Ada', now)
    await ada.connect()
    await flush()
    ada.submit({ choice: 1 } as RelayValue)
    const pid = playerId('ABCD', 'Ada')
    expect(host.inputsFor(0).get(pid)).toEqual({ choice: 1 })

    host.finish({} as RelayValue)
    host.nextGame(GAME2)
    // The host's tally for round 0 is empty again...
    expect(host.inputsFor(0).size).toBe(0)
    // ...and the cleared relay value reads as "not submitted" for the player (null
    // is treated as absent), so they aren't shown as having answered game 2 already.
    await flush()
    expect(ada.inputFor(0)).toBeUndefined()
    // The player is still in the room (presence persists across games).
    expect(host.recentPlayers().map((p) => p.name)).toContain('Ada')
  })

  it('clears the previous standings + results so game 2 does not show them', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.publishStandings({ leaderboard: [{ id: 'p', name: 'P', score: 9 }] } as RelayValue)
    host.finish({ winner: 'P' } as RelayValue)

    host.nextGame(GAME2)
    expect(hub.store.get(addr.standings('ABCD'))).toBeNull()
    expect(hub.store.get(addr.resultsSummary('ABCD'))).toBeNull()
    expect(host.getSnapshot().standings).toBeUndefined()
    expect(host.getSnapshot().results).toBeUndefined()
  })
})

describe('RoomRuntime audience tier (P4)', () => {
  it('a spectator reads display state but never joins the roster or counts to the cap', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    const aud = makeAudience(hub, now)
    await aud.connect()
    await flush()

    // The audience sees the phase + meta (the display state).
    expect(aud.getSnapshot().phase).toBe('active')
    expect(aud.getSnapshot().meta).toEqual(GAME.meta)
    // ...but it is NOT in the player roster (neither the host's nor its own).
    expect(host.recentPlayers()).toHaveLength(0)
    expect(aud.getSnapshot().players).toHaveLength(0)
    // The host counts it as a watcher instead.
    expect(host.getSnapshot().audienceCount).toBe(1)
  })

  it('a spectator never receives player inputs (no deanonymization)', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()

    const ada = makePlayer(hub, 'Ada', now)
    await ada.connect()
    await flush()
    ada.submit({ choice: 1 } as RelayValue)

    const aud = makeAudience(hub, now)
    await aud.connect()
    await flush()
    // The host tallies the input; the audience never sees it (no input subscription).
    expect(host.inputsFor(0).size).toBe(1)
    expect(aud.inputsFor(0).size).toBe(0)
  })

  it('rejects a submit from a spectator (only players submit)', async () => {
    const hub = new FakeHub()
    const aud = makeAudience(hub, () => 0)
    await aud.connect()
    expect(() => aud.submit({ choice: 0 } as RelayValue)).toThrow()
  })

  it('collects audience votes for the host (P4B) without touching player inputs', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()

    const ada = makePlayer(hub, 'Ada', now)
    await ada.connect()
    await flush()
    ada.submit({ choice: 1 } as RelayValue)

    const a1 = makeAudience(hub, now)
    const a2 = makeAudience(hub, now)
    await a1.connect()
    await a2.connect()
    await flush()
    a1.submitAudience({ choice: 0 } as RelayValue)
    a2.submitAudience({ choice: 0 } as RelayValue)
    await flush()

    // The host sees both audience votes, separate from the single player input.
    expect(host.audienceVotesFor(0).size).toBe(2)
    expect(host.inputsFor(0).size).toBe(1)
    // An audience member keeps its own vote, and a player can't submit one.
    expect(a1.audienceVotesFor(0).size).toBe(1)
    expect(() => ada.submitAudience({ choice: 0 } as RelayValue)).toThrow()
  })

  it('counts multiple spectators and ages out stale ones', async () => {
    const hub = new FakeHub()
    let t = 0
    const host = makeHost(hub, () => t)
    await host.connect()
    const a1 = makeAudience(hub, () => t)
    const a2 = makeAudience(hub, () => t)
    await a1.connect()
    await a2.connect()
    await flush()
    expect(host.getSnapshot().audienceCount).toBe(2)
    // Time advances past the presence window with no new pings -> they age out.
    t = 30_000
    expect(host.getSnapshot().audienceCount).toBe(0)
  })
})

describe('RoomRuntime running standings (P3)', () => {
  it('host publishes standings; a player reads them from the relay', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    host.publishStandings({ leaderboard: [{ id: 'p_1', name: 'Ada', score: 3 }] } as RelayValue)
    expect(hub.store.get(addr.standings('ABCD'))).toEqual({ leaderboard: [{ id: 'p_1', name: 'Ada', score: 3 }] })
    expect(host.getSnapshot().standings).toEqual({ leaderboard: [{ id: 'p_1', name: 'Ada', score: 3 }] })

    const ada = makePlayer(hub, 'Ada', now)
    await ada.connect()
    await flush()
    expect(ada.getSnapshot().standings).toEqual({ leaderboard: [{ id: 'p_1', name: 'Ada', score: 3 }] })
  })

  it('only the host may publish standings', async () => {
    const hub = new FakeHub()
    const ada = makePlayer(hub, 'Ada', () => 0)
    await ada.connect()
    expect(() => ada.publishStandings({} as RelayValue)).toThrow()
  })
})

describe('RoomRuntime teams (P5)', () => {
  it('stamps team names into meta and clears them', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    host.loadGame(GAME)

    host.setTeams(['Red', 'Blue'])
    expect((hub.store.get(addr.meta('ABCD')) as { teams?: string[] }).teams).toEqual(['Red', 'Blue'])

    host.setTeams(null)
    expect((hub.store.get(addr.meta('ABCD')) as { teams?: string[] }).teams).toBeUndefined()
    host.setTeams([])
    expect((hub.store.get(addr.meta('ABCD')) as { teams?: string[] }).teams).toBeUndefined()
  })

  it('a player picks a team; the host rosters it; a reconnect keeps it', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    const ada = makePlayer(hub, 'Ada', now)
    await ada.connect()
    await flush()
    ada.setTeam('Red')
    expect(ada.myTeam).toBe('Red')

    const pid = playerId('ABCD', 'Ada')
    expect(hub.store.get(addr.playerTeam('ABCD', pid))).toBe('Red')
    // The host sees the team on the roster entry.
    expect(host.recentPlayers().find((p) => p.id === pid)?.team).toBe('Red')

    // A reconnect (new runtime, same name) recovers the team from the retained value.
    const ada2 = makePlayer(hub, 'Ada', now)
    await ada2.connect()
    await flush()
    expect(ada2.me.id).toBe(pid)
    expect(ada2.myTeam).toBe('Red')
  })

  it('a profile/ping arriving after the team does not wipe the team', async () => {
    const hub = new FakeHub()
    const now = () => 1_000
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()

    const pid = playerId('ABCD', 'Bo')
    // The team value lands first (e.g. a retained value delivered before profile/ping).
    hub.set(addr.playerTeam('ABCD', pid), 'Blue')
    // Then the profile + a fresh ping arrive.
    hub.set(addr.playerProfile('ABCD', pid), { name: 'Bo', joinedAtIndex: 0 })
    hub.set(addr.playerPing('ABCD', pid), 1_000)
    const bo = host.recentPlayers().find((p) => p.id === pid)
    expect(bo?.name).toBe('Bo')
    expect(bo?.team).toBe('Blue') // preserved through both handlers
  })

  it('the host can assign (and clear) a player team, e.g. auto-balance', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    const ada = makePlayer(hub, 'Ada', now)
    await ada.connect()
    await flush()

    host.assignTeam(ada.me.id, 'Green')
    expect(ada.myTeam).toBe('Green') // the player sees the host's assignment
    expect(host.recentPlayers().find((p) => p.id === ada.me.id)?.team).toBe('Green')

    host.assignTeam(ada.me.id, null)
    expect(ada.myTeam).toBeNull()
  })

  it('setTeam is a no-op for the host (only players pick their own team)', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    host.setTeam('Red')
    expect(hub.store.get(addr.playerTeam('ABCD', host.me.id))).toBeUndefined()
  })
})

describe('RoomRuntime co-host / MC delegation (B9)', () => {
  async function setup() {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start() // round 0, state ready
    const mia = makePlayer(hub, 'Mia', now)
    await mia.connect()
    await flush()
    return { hub, host, mia, now }
  }

  it('delegates driving and applies the driver\'s intent on the host', async () => {
    const { hub, host, mia } = await setup()
    host.setDriver(mia.me.id)
    expect(hub.store.get(addr.controlDriver('ABCD'))).toBe(mia.me.id)
    expect(mia.getSnapshot().isDriver).toBe(true)

    mia.sendControl('open')
    // The host validated the intent and queued it for its UI to dispatch.
    expect(host.getSnapshot().command?.action).toBe('open')
  })

  it('lets a lobby driver send a start intent the host can apply', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    // No start(): the room is still in the lobby, where the driver is designated.
    const mia = makePlayer(hub, 'Mia', now)
    await mia.connect()
    await flush()
    host.setDriver(mia.me.id)
    expect(mia.getSnapshot().phase).toBe('lobby')

    mia.sendControl('start')
    // The host accepts the lobby intent (current driver, current round 0) and
    // queues it; the host UI maps 'start' to host.start() while phase is lobby.
    expect(host.getSnapshot().command?.action).toBe('start')
  })

  it('does not let a non-delegated player drive', async () => {
    const { hub, host, mia } = await setup()
    const rob = makePlayer(hub, 'Rob', () => 0)
    await rob.connect()
    await flush()
    host.setDriver(mia.me.id)
    // Rob's own sendControl is a no-op (he isn't the driver); simulate a tampered
    // client publishing a raw command and confirm the host drops it.
    rob.sendControl('open')
    // setDriver cleared the channel to null; Rob's no-op leaves it null (not his command).
    expect(hub.store.get(addr.controlCommand('ABCD'))).toBeNull()
    hub.set(addr.controlCommand('ABCD'), { pid: rob.me.id, action: 'open', index: 0, nonce: 1 })
    expect(host.getSnapshot().command).toBeNull()
  })

  it('ignores a stale command for a round that already moved on', async () => {
    const { hub, host, mia } = await setup()
    host.setDriver(mia.me.id)
    hub.set(addr.controlCommand('ABCD'), { pid: mia.me.id, action: 'open', index: 5, nonce: 1 })
    expect(host.getSnapshot().command).toBeNull()
  })

  it('clears the driver when the host takes back control', async () => {
    const { host, mia } = await setup()
    host.setDriver(mia.me.id)
    expect(mia.getSnapshot().isDriver).toBe(true)
    host.setDriver(null)
    expect(mia.getSnapshot().isDriver).toBe(false)
  })

  it('wipes the retained drive command on a driver change so it cannot replay', async () => {
    const { hub, host, mia } = await setup()
    host.setDriver(mia.me.id)
    mia.sendControl('open')
    expect(host.getSnapshot().command?.action).toBe('open')
    // A driver change clears the retained command, so a relay re-delivery is a no-op
    // even if the room is back on the same round index (the replay the audit caught).
    host.setDriver(null)
    expect(hub.store.get(addr.controlCommand('ABCD'))).toBeNull()
    host.setDriver(mia.me.id)
    expect(host.getSnapshot().command).toBeNull()
  })

  it('drops a drive command that carries no nonce (not replay-safe)', async () => {
    const { hub, host, mia } = await setup()
    host.setDriver(mia.me.id)
    hub.set(addr.controlCommand('ABCD'), { pid: mia.me.id, action: 'reveal', index: 0 })
    expect(host.getSnapshot().command).toBeNull()
  })
})

describe('RoomRuntime custom channels (D13 battle transport)', () => {
  it('publishes and reads a custom channel, with a wildcard and the key suffix', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    const got: Array<{ v: unknown; key: string }> = []
    host.onExtra('cheer/*', (v, key) => got.push({ v, key }))
    host.publishExtra('cheer/p_1', 1)
    host.publishExtra('cheer/p_2', 2)
    host.publishExtra('other', 9) // does not match cheer/*
    expect(got).toEqual([
      { v: 1, key: 'cheer/p_1' },
      { v: 2, key: 'cheer/p_2' },
    ])
  })

  it('stops delivering after unsubscribe', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    await host.connect()
    const got: unknown[] = []
    const off = host.onExtra('battle', (v) => got.push(v))
    host.publishExtra('battle', 1)
    off()
    host.publishExtra('battle', 2)
    expect(got).toEqual([1])
  })

  it('defers a subscription made before connect, then delivers once connected', async () => {
    // The real relay drops a `.on()` made before the socket connects (it is not
    // replayed), and a custom-flow host subscribes from `onMounted`, before its
    // async connect resolves. So onExtra must defer the real subscribe until
    // connected: subscribe BEFORE connect, then connect, then publish -> delivered.
    const hub = new FakeHub()
    const host = makeHost(hub, () => 0)
    const got: unknown[] = []
    host.onExtra('drive/*/*', (v) => got.push(v)) // subscribed before connect()
    await host.connect()
    host.publishExtra('drive/p_1/cmd', 7)
    expect(got).toEqual([7])
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

describe('RoomRuntime hidden-role assignment (the faker pattern)', () => {
  // A round 0 that assigns a secret role and withholds WHO the imposter is.
  const ASSIGNED = {
    meta: { pluginId: 'faker', pluginVersion: '0.0.0', title: 'Hidden role', themeId: 'doot' },
    config: { title: 'Hidden role', rounds: [{}] } as RelayValue,
    rounds: [{ timer: null }],
    assignContent: (index: number) => {
      if (index !== 0) return undefined
      return { perPlayer: {}, answer: { fakerPid: 'p_x', word: 'Banana' } as RelayValue }
    },
  }

  it('keeps an assigned answer host-side and does NOT publish it at the round reveal', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(ASSIGNED)
    host.start() // assigns + stores the answer host-side

    // The host knows the imposter locally...
    expect(host.answerKeyFor(0)).toEqual({ fakerPid: 'p_x', word: 'Banana' })
    // ...but it is never on the relay, even after the round's reveal (a later judge
    // round would unmask it; auto-publishing here would leak the role early).
    host.openVoting()
    host.lock()
    host.reveal()
    expect(hub.store.get(addr.roundAnswer('ABCD', 0))).toBeUndefined()
    // Still held host-side for the judge round + scoring.
    expect(host.answerKeyFor(0)).toEqual({ fakerPid: 'p_x', word: 'Banana' })
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

  it('lets a PLAYER see the full roster (for roster games) but NOT others inputs', async () => {
    // Most Likely To / Truth or Share need each player's phone to see who else is in
    // the room, while answer-withholding still forbids a player from reading another
    // player's submitted input.
    const hub = new FakeHub()
    const now = () => 0
    const host = makeHost(hub, now)
    await host.connect()
    host.loadGame(GAME)
    host.start()
    host.openVoting()

    const ada = makePlayer(hub, 'Ada', now)
    const bo = makePlayer(hub, 'Bo', now)
    await ada.connect()
    await bo.connect()
    await flush()

    // Each player sees BOTH players in its own roster (not just itself, not empty).
    const adaRoster = ada.getSnapshot().players.map((p) => p.name).sort()
    const boRoster = bo.getSnapshot().players.map((p) => p.name).sort()
    expect(adaRoster).toEqual(['Ada', 'Bo'])
    expect(boRoster).toEqual(['Ada', 'Bo'])

    // Withholding still holds: Ada submits, but Bo's runtime never receives it.
    ada.submit({ choice: 2 } as RelayValue)
    await flush()
    expect(bo.inputFor(0)).toBeUndefined()
    expect(host.inputsFor(0).get(playerId('ABCD', 'Ada'))).toEqual({ choice: 2 })
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

describe('room code collision', () => {
  it('regenerates a colliding code on connect, never hijacking a live room', async () => {
    const hub = new FakeHub()
    const now = () => 1000
    // A live room already holds ABCD (a recent host heartbeat).
    hub.store.set(addr.hostPing('ABCD'), now())
    const host = makeHost(hub, now)
    await host.connect()
    expect(host.room).not.toBe('ABCD')
    // It claimed (published its lobby on) the NEW code, and left ABCD untouched.
    expect(hub.store.get(addr.phase('ABCD'))).toBeUndefined()
    expect(hub.store.get(addr.phase(host.room))).toBe('lobby')
  })

  it('keeps a free code (no live heartbeat there)', async () => {
    const hub = new FakeHub()
    const host = makeHost(hub, () => 1000)
    await host.connect()
    expect(host.room).toBe('ABCD')
  })

  it('treats a stale heartbeat as free, so codes recycle', async () => {
    const hub = new FakeHub()
    hub.store.set(addr.hostPing('ABCD'), 1000) // old beat
    const host = makeHost(hub, () => 1_000_000) // long after the presence window
    await host.connect()
    expect(host.room).toBe('ABCD')
  })

  it('does not regenerate for players (they keep the exact code given)', async () => {
    const hub = new FakeHub()
    const now = () => 1000
    hub.store.set(addr.hostPing('ABCD'), now())
    const player = makePlayer(hub, 'Robin', now)
    await player.connect()
    expect(player.room).toBe('ABCD')
  })

  it('keeps its OWN live code on reload (matching host token), so players are not stranded', async () => {
    const hub = new FakeHub()
    const now = () => 1000
    // A live room holds ABCD, carrying THIS host's token (the pre-reload heartbeat).
    hub.store.set(addr.hostPing('ABCD'), now())
    hub.store.set(addr.hostToken('ABCD'), 'tok-1')
    const host = new RoomRuntime({ relay: new FakeRelayClient(hub), room: 'ABCD', role: 'host', now, hostToken: 'tok-1' })
    cleanups.push(() => host.dispose())
    await host.connect()
    expect(host.room).toBe('ABCD') // recognized itself, did not regenerate
  })

  it('still regenerates when a DIFFERENT host holds the live code (different token)', async () => {
    const hub = new FakeHub()
    const now = () => 1000
    hub.store.set(addr.hostPing('ABCD'), now())
    hub.store.set(addr.hostToken('ABCD'), 'tok-1') // someone else's host instance
    const host = new RoomRuntime({ relay: new FakeRelayClient(hub), room: 'ABCD', role: 'host', now, hostToken: 'tok-2' })
    cleanups.push(() => host.dispose())
    await host.connect()
    expect(host.room).not.toBe('ABCD') // a genuine collision, regenerate (no hijack)
  })
})

describe('player-name filter', () => {
  it('masks the roster display name via the injected nameFilter, keeping identity', async () => {
    const hub = new FakeHub()
    const now = () => 1000
    const host = new RoomRuntime({
      relay: new FakeRelayClient(hub),
      room: 'ABCD',
      role: 'host',
      now,
      nameFilter: (n) => n.replace(/badword/gi, '*******'),
    })
    cleanups.push(() => host.dispose())
    await host.connect()
    const p = makePlayer(hub, 'Badword', now)
    await p.connect()
    await flush()
    const roster = host.recentPlayers()
    expect(roster.length).toBe(1)
    expect(roster[0].name).toBe('*******') // masked on the big screen / roster
    expect(roster[0].id).toBe(playerId('ABCD', 'Badword')) // identity from the RAW name (reconnect-safe)
  })

  it('leaves names unchanged when no nameFilter is set', async () => {
    const hub = new FakeHub()
    const now = () => 1000
    const host = makeHost(hub, now)
    await host.connect()
    const p = makePlayer(hub, 'Robin', now)
    await p.connect()
    await flush()
    expect(host.recentPlayers()[0].name).toBe('Robin')
  })
})
