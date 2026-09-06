/**
 * The roster is published by the host, once, and read by everyone else.
 *
 * It used to be derived independently on every device: each client subscribed to
 * `player/*\/ping` and `player/*\/profile`, so N phones beating cost the relay N
 * deliveries to each of N clients. At the 145-phone party that is roughly 2,100
 * deliveries a second whose only purpose is to let 145 devices each compute the
 * same list. The engine now does what it already does for phase, round and
 * config: one writer, one value, N readers.
 *
 * These tests measure the fan-out rather than asserting on it in prose, so a
 * regression shows up as a number.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { addr } from './addresses'
import type { RelayCallback, RelayClient, RelayValue, Unsubscribe } from './relay'
import { RoomRuntime } from './room'

/** A hub that counts every delivery it makes, per address. */
class CountingHub {
  store = new Map<string, RelayValue>()
  subs = new Set<{ pattern: string; cb: RelayCallback }>()
  /** address -> how many times it was delivered to a subscriber. */
  deliveries = new Map<string, number>()

  private deliver(address: string, value: RelayValue) {
    for (const s of this.subs) {
      if (!matches(s.pattern, address)) continue
      this.deliveries.set(address, (this.deliveries.get(address) ?? 0) + 1)
      s.cb(value, address)
    }
  }
  set(address: string, value: RelayValue) {
    this.store.set(address, value)
    this.deliver(address, value)
  }
  emit(address: string, value: RelayValue = 1) {
    this.deliver(address, value)
  }
  subscribe(pattern: string, cb: RelayCallback): Unsubscribe {
    const entry = { pattern, cb }
    this.subs.add(entry)
    for (const [address, value] of this.store) if (matches(pattern, address)) cb(value, address)
    return () => this.subs.delete(entry)
  }
  /** Total deliveries for every address matching a prefix. */
  countUnder(prefix: string): number {
    let n = 0
    for (const [a, c] of this.deliveries) if (a.startsWith(prefix)) n += c
    return n
  }
}
function matches(pattern: string, address: string): boolean {
  const p = pattern.split('/')
  const a = address.split('/')
  return p.length === a.length && p.every((seg, i) => seg === '*' || seg === a[i])
}
class FakeRelayClient implements RelayClient {
  connected = false
  private connectCbs: Array<() => void> = []
  constructor(private hub: CountingHub) {}
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
  emit(address: string, payload?: RelayValue) {
    this.hub.emit(address, payload ?? 1)
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const ROOM = 'ABCD'
const GAME = {
  meta: { pluginId: 'custom', pluginVersion: '0.0.0', title: 'T', themeId: 'doot' },
  config: { title: 'T', rounds: [{}, {}] } as RelayValue,
  rounds: [{ timer: null }, { timer: null }],
}
function makeHost(hub: CountingHub, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: ROOM, role: 'host', now })
  cleanups.push(() => r.dispose())
  return r
}
function makePlayer(hub: CountingHub, name: string, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: ROOM, role: 'player', name, now })
  cleanups.push(() => r.dispose())
  return r
}

/** A host plus `n` players, all connected and rostered. */
async function room(hub: CountingHub, n: number, now: () => number) {
  const host = makeHost(hub, now)
  await host.connect()
  host.loadGame(GAME)
  const players = []
  for (let i = 0; i < n; i++) {
    const p = makePlayer(hub, `P${i}`, now)
    await p.connect()
    players.push(p)
  }
  await flush()
  host.tick(now())
  await flush()
  return { host, players }
}

describe('the host is the single writer of the roster', () => {
  it('gets the whole room onto every phone', async () => {
    const hub = new CountingHub()
    const { players } = await room(hub, 4, () => 1_000)
    const seen = players[0]!.getSnapshot().players.map((p) => p.name).sort()
    expect(seen).toEqual(['P0', 'P1', 'P2', 'P3'])
  })

  it('publishes ONE value, not one per player', async () => {
    const hub = new CountingHub()
    await room(hub, 6, () => 1_000)
    expect(hub.store.has(addr.roster(ROOM))).toBe(true)
    const roster = hub.store.get(addr.roster(ROOM)) as Array<{ id: string; name: string }>
    expect(roster).toHaveLength(6)
  })

  it('carries a team the HOST assigned, so auto-balance reaches the phone', async () => {
    const hub = new CountingHub()
    const { host, players } = await room(hub, 2, () => 1_000)
    host.setTeams(['Red', 'Blue'])
    host.assignTeam(players[0]!.me.id, 'Red')
    await flush()
    host.tick(1_000)
    await flush()
    expect(players[0]!.myTeam).toBe('Red')
  })

  it('leaves the roster alone when nothing changed', async () => {
    const hub = new CountingHub()
    const { host } = await room(hub, 3, () => 1_000)
    const before = hub.deliveries.get(addr.roster(ROOM)) ?? 0
    // A quiet room: several ticks, nobody joining, leaving, or renaming.
    for (let i = 0; i < 10; i++) host.tick(1_000 + i)
    await flush()
    expect(hub.deliveries.get(addr.roster(ROOM)) ?? 0).toBe(before)
  })
})

describe('presence fan-out is linear, not quadratic', () => {
  it('no phone receives another phone\'s heartbeat', async () => {
    const hub = new CountingHub()
    const now = () => 1_000
    const { players } = await room(hub, 8, now)

    const before = hub.countUnder(`/doot/${ROOM}/player/`)
    // Every phone beats once (the relay delivering one heartbeat event each).
    for (const p of players) hub.emit(addr.playerPing(ROOM, p.me.id))
    await flush()
    const beats = hub.countUnder(`/doot/${ROOM}/player/`) - before

    // 8 beats, each delivered to exactly ONE subscriber: the host. The old shape
    // delivered each beat to all 8 clients (8 x 8 = 64).
    expect(beats).toBe(players.length)
  })

  it('the per-beat cost stops growing as the room fills', async () => {
    const cost = async (n: number) => {
      const hub = new CountingHub()
      const { players } = await room(hub, n, () => 1_000)
      const before = hub.countUnder(`/doot/${ROOM}/player/`)
      for (const p of players) hub.emit(addr.playerPing(ROOM, p.me.id))
      await flush()
      return (hub.countUnder(`/doot/${ROOM}/player/`) - before) / n
    }
    // Deliveries PER BEAT is flat at 1 (just the host) however big the room gets.
    // Quadratic fan-out would make this 4, then 16.
    expect(await cost(4)).toBe(1)
    expect(await cost(16)).toBe(1)
  })
})

describe('what a phone is allowed to see', () => {
  it('still cannot read another player\'s answers', async () => {
    const hub = new CountingHub()
    const now = () => 1_000
    const { host, players } = await room(hub, 2, now)
    host.start()
    host.openVoting()
    players[0]!.submit({ choice: 3 } as RelayValue)
    await flush()
    // The withholding invariant is untouched by the roster change: a player reads
    // its own input and nobody else's.
    expect(players[0]!.inputFor(0)).toEqual({ choice: 3 })
    expect(players[1]!.inputFor(0)).toBeUndefined()
    // ...while the host sees both sides for tallying.
    expect(host.inputsFor(0).size).toBe(1)
  })

  it('an audience member gets no roster at all', async () => {
    const hub = new CountingHub()
    const now = () => 1_000
    await room(hub, 3, now)
    const aud = new RoomRuntime({ relay: new FakeRelayClient(hub), room: ROOM, role: 'audience', now })
    cleanups.push(() => aud.dispose())
    await aud.connect()
    await flush()
    // Spectators read display state only; the roster would be needless bandwidth
    // and is one more thing that could deanonymize a two-phase gallery.
    expect(aud.getSnapshot().players).toEqual([])
  })
})
