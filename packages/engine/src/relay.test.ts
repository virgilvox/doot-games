import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ClaspLike, createClaspRelay } from './relay'

/**
 * A drivable fake of the `@clasp-to/core` client (the {@link ClaspLike} slice)
 * sharing one in-memory hub across instances, so a rebuilt client replays the
 * retained store on subscribe, exactly like the real relay. Tests can `drop()`
 * a socket or make the next connect fail to exercise the reconnection
 * supervisor without a WebSocket.
 */
class FakeHub {
  store = new Map<string, unknown>()
  /** How many live (un-disposed) subscriptions exist across all instances now. */
  subs = new Set<{ pattern: string; cb: (v: unknown, a: string) => void }>()
}

function matches(pattern: string, address: string): boolean {
  const p = pattern.split('/')
  const a = address.split('/')
  if (p.length !== a.length) return false
  return p.every((seg, i) => seg === '*' || seg === a[i])
}

class FakeClasp implements ClaspLike {
  connected = false
  failNextConnect = false
  private connectCbs: Array<() => void> = []
  private disconnectCbs: Array<(r?: string) => void> = []
  private errorCbs: Array<(e: unknown) => void> = []
  /** This session's own subscriptions, dropped when the socket closes. */
  private mySubs = new Set<{ pattern: string; cb: (v: unknown, a: string) => void }>()
  constructor(
    private hub: FakeHub,
    private all: FakeClasp[],
  ) {
    all.push(this)
  }
  async connect() {
    if (this.failNextConnect) {
      this.failNextConnect = false
      const err = new Error('boom')
      for (const cb of this.errorCbs) cb(err)
      throw err
    }
    this.connected = true
    for (const cb of this.connectCbs) cb()
  }
  close() {
    this.connected = false
    // Closing the session drops its subscriptions (mirrors the real relay).
    for (const e of this.mySubs) this.hub.subs.delete(e)
    this.mySubs.clear()
  }
  on(pattern: string, cb: (v: unknown, a: string) => void) {
    const entry = { pattern, cb }
    this.hub.subs.add(entry)
    this.mySubs.add(entry)
    // Replay retained values on subscribe (relay snapshot behavior).
    for (const [address, value] of this.hub.store) {
      if (matches(pattern, address)) cb(value, address)
    }
    return () => {
      this.hub.subs.delete(entry)
      this.mySubs.delete(entry)
    }
  }
  set(address: string, value: unknown) {
    this.hub.store.set(address, value)
    for (const s of this.hub.subs) if (matches(s.pattern, address)) s.cb(value, address)
  }
  async get(address: string) {
    return this.hub.store.get(address)
  }
  cached(address: string) {
    return this.hub.store.get(address)
  }
  onConnect(cb: () => void) {
    this.connectCbs.push(cb)
  }
  onDisconnect(cb: (r?: string) => void) {
    this.disconnectCbs.push(cb)
  }
  onReconnect() {}
  onError(cb: (e: unknown) => void) {
    this.errorCbs.push(cb)
  }
  /** Simulate the socket dropping (CLASP fires onDisconnect, then gives up). */
  drop() {
    this.connected = false
    for (const cb of this.disconnectCbs) cb('dropped')
  }
}

function setup() {
  const hub = new FakeHub()
  const all: FakeClasp[] = []
  // Each `true` shifted off makes the next-built client fail its connect once.
  const failQueue: boolean[] = []
  const relay = createClaspRelay('wss://test', {}, {
    makeClient: () => {
      const c = new FakeClasp(hub, all)
      if (failQueue.shift()) c.failNextConnect = true
      return c
    },
    reconnectBaseMs: 100,
    reconnectMaxMs: 1000,
    jitter: () => 0, // deterministic: delay = backoff * 0.5
  })
  return { hub, all, relay, failQueue }
}

describe('createClaspRelay reconnection supervisor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rebuilds the client and re-subscribes after a drop, re-hydrating retained state', async () => {
    const { hub, all, relay } = setup()
    const seen: unknown[] = []
    relay.onConnect(() => {})
    relay.on('doot/R/phase', (v) => seen.push(v))
    await relay.connect()
    expect(relay.connected).toBe(true)
    expect(all).toHaveLength(1)

    // Host publishes phase; our subscription sees it.
    all[0].set('doot/R/phase', 'active')
    expect(seen).toEqual(['active'])

    // Socket drops. The old CLASP would give up; our supervisor reconnects.
    all[0].drop()
    expect(relay.connected).toBe(false)

    await vi.runOnlyPendingTimersAsync()

    // A brand-new client was built and connected, and the subscription was
    // re-registered, so the retained 'active' phase is replayed to us.
    expect(all).toHaveLength(2)
    expect(relay.connected).toBe(true)
    expect(seen).toEqual(['active', 'active'])
    // Exactly one live subscription (the old one was disposed on rebuild).
    expect(hub.subs.size).toBe(1)
    relay.close()
  })

  it('retries with backoff until a reconnect succeeds', async () => {
    const { all, relay, failQueue } = setup()
    await relay.connect()
    expect(all).toHaveLength(1)
    // The first rebuilt client fails its connect; the second succeeds.
    failQueue.push(true)
    all[0].drop()

    await vi.runOnlyPendingTimersAsync() // first retry: rebuild #2, connect fails
    expect(all).toHaveLength(2)
    expect(relay.connected).toBe(false)

    await vi.runOnlyPendingTimersAsync() // second retry: rebuild #3, connect ok
    expect(all).toHaveLength(3)
    expect(relay.connected).toBe(true)
    relay.close()
  })

  it('stops retrying once closed', async () => {
    const { all, relay } = setup()
    await relay.connect()
    relay.close()
    all[0].drop()
    await vi.runOnlyPendingTimersAsync()
    // No new client built after close.
    expect(all).toHaveLength(1)
    expect(relay.connected).toBe(false)
  })

  it('close() cancels a retry already scheduled by a drop', async () => {
    const { all, relay } = setup()
    await relay.connect()
    all[0].drop() // schedules a retry timer
    relay.close() // must cancel it before it fires
    await vi.runOnlyPendingTimersAsync()
    expect(all).toHaveLength(1) // the pending retry never rebuilt a client
    expect(relay.connected).toBe(false)
  })

  it('does not auto-retry a failed FIRST connect (caller owns it)', async () => {
    const { all, relay } = setup()
    all[0].failNextConnect = true
    await expect(relay.connect()).rejects.toThrow('boom')
    await vi.runOnlyPendingTimersAsync()
    // everConnected was never true, so the supervisor stays idle.
    expect(all).toHaveLength(1)
    expect(relay.connected).toBe(false)
    relay.close()
  })

  it('forwards connect/disconnect to engine-level listeners across rebuilds', async () => {
    const { all, relay } = setup()
    let connects = 0
    let disconnects = 0
    relay.onConnect(() => connects++)
    relay.onDisconnect(() => disconnects++)
    await relay.connect()
    expect(connects).toBe(1)
    all[0].drop()
    expect(disconnects).toBe(1)
    await vi.runOnlyPendingTimersAsync()
    expect(connects).toBe(2) // reconnect fired onConnect again
    relay.close()
  })
})
