/**
 * Presence under REAL-ROOM conditions, not lab conditions.
 *
 * Presence used to compare a timestamp written by ANOTHER machine's `Date.now()`
 * against THIS machine's. That is only sound when every clock in the room agrees,
 * and at a live event they do not: phones drift, a venue laptop wakes from sleep
 * with a stale RTC, and a browser that backgrounds a tab stops firing the
 * heartbeat interval altogether. In room Z2CP that greyed out "Lock it in" on
 * 145 phones, because `canSubmit` hung off the host-presence flag.
 *
 * Presence is now measured from the LOCAL arrival time of a beat, so the only
 * clock involved is the one doing the asking. These tests are the regression
 * lock for that: each one is a room condition we actually hit.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { addr } from './addresses'
import type { RelayCallback, RelayClient, RelayValue, Unsubscribe } from './relay'
import {
  HOST_HEARTBEAT_INTERVAL_MS,
  HOST_PRESENCE_WINDOW_MS,
  RoomRuntime,
  heartbeatIntervalFor,
  presenceWindowFor,
} from './room'

class FakeHub {
  store = new Map<string, RelayValue>()
  subs = new Set<{ pattern: string; cb: RelayCallback }>()
  set(address: string, value: RelayValue) {
    this.store.set(address, value)
    for (const s of this.subs) if (matches(s.pattern, address)) s.cb(value, address)
  }

  /** One-shot event: delivered to whoever is subscribed NOW, never stored. */
  emit(address: string, value: RelayValue = 1) {
    for (const s of this.subs) if (matches(s.pattern, address)) s.cb(value, address)
  }
  subscribe(pattern: string, cb: RelayCallback): Unsubscribe {
    const entry = { pattern, cb }
    this.subs.add(entry)
    for (const [address, value] of this.store) if (matches(pattern, address)) cb(value, address)
    return () => this.subs.delete(entry)
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
function player(hub: FakeHub, name: string, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: ROOM, role: 'player', name, now })
  cleanups.push(() => r.dispose())
  return r
}
function host(hub: FakeHub, now: () => number) {
  const r = new RoomRuntime({ relay: new FakeRelayClient(hub), room: ROOM, role: 'host', now })
  cleanups.push(() => r.dispose())
  return r
}
const GAME = {
  meta: { pluginId: 'custom', pluginVersion: '0.0.0', title: 'T', themeId: 'doot' },
  config: { title: 'T', rounds: [{}, {}] } as RelayValue,
  rounds: [{ timer: null }, { timer: null }],
}
/** One host liveness beat. It is an EVENT and carries no payload: there is no
 *  host timestamp to compare against ours, which is the whole point. The unused
 *  argument is kept so each test can still SAY what the host's clock reads. */
const hostBeat = (hub: FakeHub, _hostClock?: number) => hub.emit(addr.hostPing(ROOM))

describe('host presence survives clock skew', () => {
  it('a phone whose clock runs 30s fast still sees a live host', async () => {
    const hub = new FakeHub()
    const hostClock = 1_700_000_000_000
    // Nothing is wrong with this room: the host is beating and sitting right
    // there. The phone just disagrees about what time it is, by half a window.
    const phone = player(hub, 'Robin', () => hostClock + 30_000)
    await phone.connect()
    await flush()
    hostBeat(hub, hostClock)
    expect(phone.getSnapshot().hostPresent).toBe(true)
  })

  it('a phone whose clock runs 5 minutes slow still sees a live host', async () => {
    const hub = new FakeHub()
    const t = 1_700_000_000_000
    const phone = player(hub, 'Alex', () => t - 300_000)
    await phone.connect()
    await flush()
    hostBeat(hub, t)
    expect(phone.getSnapshot().hostPresent).toBe(true)
  })

  it('a HOST clock 25s behind the phones no longer blanks the whole room', async () => {
    const hub = new FakeHub()
    const phoneClock = 1_700_000_000_000
    // Venue laptop woke from sleep with no NTP. It beats on time; every beat is
    // stamped in what the phones consider the past. This is the Z2CP shape.
    const phones = ['A', 'B', 'C'].map((n) => player(hub, n, () => phoneClock))
    for (const p of phones) await p.connect()
    await flush()
    hostBeat(hub, phoneClock - 25_000)
    expect(phones.map((p) => p.getSnapshot().hostPresent)).toEqual([true, true, true])
  })

  it('an absurd skew in either direction is still fine, because no clock is compared', async () => {
    const hub = new FakeHub()
    const t = 1_700_000_000_000
    const phone = player(hub, 'Sam', () => t)
    await phone.connect()
    await flush()
    hostBeat(hub, 0) // host clock claims 1970; the beat carries no clock at all
    expect(phone.getSnapshot().hostPresent).toBe(true)
  })
})

describe('host presence still detects a host that really left', () => {
  it('goes false once no NEW beat arrives for a window', async () => {
    const hub = new FakeHub()
    const t0 = 1_700_000_000_000
    let clock = t0
    const phone = player(hub, 'Robin', () => clock)
    await phone.connect()
    await flush()
    hostBeat(hub)
    expect(phone.getSnapshot().hostPresent).toBe(true)

    clock = t0 + HOST_PRESENCE_WINDOW_MS + 1_000 // host tab closed; nothing arrives
    expect(phone.getSnapshot().hostPresent).toBe(false)
  })

  it('stores nothing, so a dead room leaves no beat behind to be replayed', async () => {
    const hub = new FakeHub()
    const t0 = 1_700_000_000_000
    let clock = t0
    const phone = player(hub, 'Robin', () => clock)
    await phone.connect()
    await flush()
    hostBeat(hub)
    expect(phone.getSnapshot().hostPresent).toBe(true)

    // An event is never retained. This is what used to leave 147 dead ping
    // addresses on the relay after one party, and what made a resubscribe replay
    // a stale beat that read as "alive".
    expect(hub.store.has(addr.hostPing(ROOM))).toBe(false)

    clock = t0 + HOST_PRESENCE_WINDOW_MS + 1_000
    expect(phone.getSnapshot().hostPresent).toBe(false)

    // A client that resubscribes to a dead room gets NO replay, so it cannot be
    // fooled into thinking the host is back.
    let replayed = 0
    const stop = hub.subscribe(addr.hostPing(ROOM), () => {
      replayed++
    })
    expect(replayed).toBe(0)
    stop()

    // A late joiner is likewise not told the host is present by anything stale;
    // it only learns from a real beat.
    const late = player(hub, 'Late', () => clock)
    await late.connect()
    await flush()

    // Only a real, live beat brings it back.
    hostBeat(hub)
    expect(phone.getSnapshot().hostPresent).toBe(true)
  })

  it('assumes present before any beat, so joining never flashes "host gone"', async () => {
    const hub = new FakeHub()
    const phone = player(hub, 'Early', () => 1_700_000_000_000)
    await phone.connect()
    await flush()
    expect(phone.getSnapshot().hostPresent).toBe(true)
  })
})

describe('host presence survives a throttled background tab', () => {
  it('a host beating once a minute stays present the whole minute', async () => {
    const hub = new FakeHub()
    const t0 = 1_700_000_000_000
    let clock = t0
    const phone = player(hub, 'Robin', () => clock)
    await phone.connect()
    await flush()
    hostBeat(hub)

    // Chrome clamps a hidden tab's timers to ~1/min after five minutes hidden.
    // The host still beats, just rarely. The room must not flicker for 44s of
    // every minute the way it used to.
    const seen: boolean[] = []
    for (let s = 4; s <= 60; s += 4) {
      clock = t0 + s * 1000
      if (s === 60) hostBeat(hub, clock)
      seen.push(phone.getSnapshot().hostPresent)
    }
    expect(seen.every(Boolean)).toBe(true)
  })

  it('the window now covers a full throttled minute rather than three beats', () => {
    expect(HOST_PRESENCE_WINDOW_MS).toBeGreaterThanOrEqual(60_000)
    expect(HOST_PRESENCE_WINDOW_MS / HOST_HEARTBEAT_INTERVAL_MS).toBeGreaterThanOrEqual(12)
  })
})

describe('player presence, and what it costs the host when it is wrong', () => {
  it('a phone with a fast clock is no longer dropped from the roster mid-game', async () => {
    const hub = new FakeHub()
    let clock = 1_700_000_000_000
    const h = host(hub, () => clock)
    await h.connect()
    h.loadGame(GAME)
    h.start()

    // This phone's clock is a minute ahead. It beats normally.
    const fast = player(hub, 'Fast', () => clock + 60_000)
    await fast.connect()
    await flush()
    expect(h.getSnapshot().players.map((p) => p.name)).toContain('Fast')

    // A little time passes, well inside the window. It must still be on the roster:
    // dropping it would also drop it out of "everyone has answered", which is what
    // stalls auto-advance and leaves the host waiting on a phone that is right there.
    clock += 5_000
    expect(h.getSnapshot().players.map((p) => p.name)).toContain('Fast')
  })

  it('a phone that genuinely stops beating still drops off', async () => {
    const hub = new FakeHub()
    let clock = 1_700_000_000_000
    const h = host(hub, () => clock)
    await h.connect()
    h.loadGame(GAME)
    h.start()
    const quiet = player(hub, 'Quiet', () => clock)
    await quiet.connect()
    await flush()
    expect(h.getSnapshot().players.map((p) => p.name)).toContain('Quiet')

    clock += presenceWindowFor(heartbeatIntervalFor(1)) + 1_000
    expect(h.getSnapshot().players.map((p) => p.name)).not.toContain('Quiet')
  })

  it('having answered keeps a quiet phone on the roster, so scoring counts them', async () => {
    const hub = new FakeHub()
    let clock = 1_700_000_000_000
    const h = host(hub, () => clock)
    await h.connect()
    h.loadGame(GAME)
    h.start()
    h.openVoting()
    const p = player(hub, 'Answered', () => clock)
    await p.connect()
    await flush()
    p.submit({ choice: 1 } as RelayValue)

    clock += presenceWindowFor(heartbeatIntervalFor(1)) + 1_000
    // This safety net is what preserved the little data room Z2CP kept.
    expect(h.getSnapshot().players.map((p) => p.name)).toContain('Answered')
  })

  it('a big room slows its beat and widens its window to match', () => {
    // 145 phones (room Z2CP): beat capped at 10s, window 30s.
    expect(heartbeatIntervalFor(145)).toBe(10_000)
    expect(presenceWindowFor(heartbeatIntervalFor(145))).toBe(30_000)
  })
})
