/**
 * The relay client. The engine talks to CLASP through this small interface so
 * that the room runtime never imports the relay SDK directly and tests can
 * inject a fake. `createClaspRelay` wraps `@clasp-to/core` (the core build,
 * Doot only needs publish/subscribe with persistence and TTL) and adds a
 * reconnection SUPERVISOR (see below).
 */
import { Clasp, type ConnectOptions, type Unsubscribe, type Value } from '@clasp-to/core'

export type RelayValue = Value
export type { Unsubscribe }

export const DEFAULT_RELAY_URL = 'wss://relay.clasp.to'

/**
 * Default absolute TTL on every published value (8 hours), in microseconds,
 * the relay's TTL unit, so the public relay does not accumulate dead rooms.
 */
export const DEFAULT_TTL_US = 8 * 3600 * 1000 * 1000

export interface RelayPublishOptions {
  /** Time-to-live. With `absolute: true` this is an absolute lifetime. */
  ttl?: number
  absolute?: boolean
}

export type RelayCallback = (value: RelayValue, address: string) => void

/** The narrow relay surface the engine depends on. */
export interface RelayClient {
  connect(): Promise<void>
  on(pattern: string, callback: RelayCallback, options?: { maxRate?: number }): Unsubscribe
  set(address: string, value: RelayValue, options?: RelayPublishOptions): void
  cached(address: string): RelayValue | undefined
  get(address: string): Promise<RelayValue>
  onConnect(callback: () => void): void
  onDisconnect(callback: (reason?: string) => void): void
  onReconnect(callback: () => void): void
  onError(callback: (error: unknown) => void): void
  close(): void
  readonly connected: boolean
}

/**
 * The slice of the `@clasp-to/core` client the wrapper drives. Declaring it lets
 * a test inject a fake client to exercise the reconnection supervisor with no
 * real WebSocket.
 */
export interface ClaspLike {
  connect(): Promise<void>
  close(): void
  on(
    pattern: string,
    callback: (value: Value, address: string) => void,
    options?: { maxRate?: number },
  ): Unsubscribe
  set(address: string, value: Value, options?: RelayPublishOptions): void
  get(address: string): Promise<Value>
  cached(address: string): Value | undefined
  onConnect(cb: () => void): void
  onDisconnect(cb: (reason?: string) => void): void
  onReconnect(cb: (attempt?: number) => void): void
  onError(cb: (error: unknown) => void): void
  readonly connected: boolean
}

export interface ClaspRelayOptions {
  /** Inject a client factory (tests). Defaults to a real `@clasp-to/core` Clasp. */
  makeClient?: (url: string, options: ConnectOptions) => ClaspLike
  /** Base reconnect backoff in ms (default 1000). */
  reconnectBaseMs?: number
  /** Max reconnect backoff in ms (default 15000). */
  reconnectMaxMs?: number
  /** Jitter source in [0,1) (tests). Defaults to Math.random. */
  jitter?: () => number
}

/**
 * Wrap `@clasp-to/core` as a {@link RelayClient} with a reconnection SUPERVISOR.
 *
 * The vendored CLASP client gives up permanently after 10 internal reconnect
 * attempts and then never tries again, stranding a phone behind a dead socket
 * (the "ratings won't load until you refresh and re-enter your name" bug at
 * party scale). So we turn the client's own reconnect OFF and own reconnection
 * here: on any drop we rebuild the client, reconnect with jittered, capped,
 * UNBOUNDED backoff, and re-register every subscription. A fresh SUBSCRIBE makes
 * the relay replay its retained snapshots, so room state re-hydrates without a
 * page reload. The engine's onConnect/onDisconnect/onReconnect/onError listeners
 * are preserved across rebuilds. Nothing is persisted off the relay; recovery is
 * pure re-subscribe to retained, TTL'd values.
 */
export function createClaspRelay(
  url: string = DEFAULT_RELAY_URL,
  options: ConnectOptions = {},
  relayOptions: ClaspRelayOptions = {},
): RelayClient {
  const make = relayOptions.makeClient ?? ((u, o) => new Clasp(u, o) as unknown as ClaspLike)
  const baseMs = relayOptions.reconnectBaseMs ?? 1000
  const maxMs = relayOptions.reconnectMaxMs ?? 15000
  const jitter = relayOptions.jitter ?? Math.random

  interface Sub {
    pattern: string
    cb: RelayCallback
    opts?: { maxRate?: number }
    live: Unsubscribe | null
  }
  const subs = new Set<Sub>()
  const connectCbs: Array<() => void> = []
  const disconnectCbs: Array<(reason?: string) => void> = []
  const reconnectCbs: Array<() => void> = []
  const errorCbs: Array<(error: unknown) => void> = []

  let client: ClaspLike
  let closed = false
  let everConnected = false
  let reconnecting = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  const bind = (s: Sub) => {
    s.live = client.on(s.pattern, (value, address) => s.cb(value, address), s.opts)
  }

  // Rebuild the client, reconnect, and re-register every subscription so the
  // relay replays its retained snapshots into the engine. On failure, reschedule.
  const reconnect = async () => {
    // One reconnect at a time: rapid flapping must not run two rebuilds that race
    // on the shared `client` (the second would reassign it mid-connect of the first).
    if (closed || reconnecting || client.connected) return
    reconnecting = true
    for (const cb of reconnectCbs) cb() // surface "reconnecting…" while we try
    try {
      client.close()
    } catch {
      /* discard the dead client */
    }
    client = buildClient()
    try {
      await client.connect()
      if (closed) {
        // Disposed mid-connect: don't bind subs or leave a live socket behind.
        try {
          client.close()
        } catch {
          /* ignore */
        }
        return
      }
      for (const s of subs) bind(s)
      // onConnect (fired inside connect()) resets `attempt` and notifies listeners.
    } catch {
      scheduleRetry()
    } finally {
      reconnecting = false
    }
  }

  // Schedule a supervised reconnect with jittered, capped, UNBOUNDED backoff.
  // Only runs after a first successful connect (the initial connect is driven by
  // the caller's connect() promise, so a failed first attempt stays the caller's
  // to handle, matching prior behavior).
  const scheduleRetry = () => {
    if (closed || !everConnected || retryTimer || client.connected) return
    const backoff = Math.min(baseMs * 2 ** attempt, maxMs)
    // Jitter [0.5x, 1.5x) so a roomful of phones don't reconnect in lockstep.
    const delay = backoff * (0.5 + jitter())
    attempt++
    retryTimer = setTimeout(() => {
      retryTimer = null
      void reconnect()
    }, delay)
  }

  function buildClient(): ClaspLike {
    // reconnect:false — the supervisor here owns ALL reconnection.
    const cl = make(url, { ...options, reconnect: false })
    cl.onConnect(() => {
      everConnected = true
      attempt = 0
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      for (const cb of connectCbs) cb()
    })
    cl.onDisconnect((reason) => {
      for (const cb of disconnectCbs) cb(reason)
      scheduleRetry()
    })
    cl.onReconnect(() => {
      for (const cb of reconnectCbs) cb()
    })
    cl.onError((error) => {
      for (const cb of errorCbs) cb(error)
      scheduleRetry()
    })
    return cl
  }

  client = buildClient()

  return {
    connect: () => client.connect(),
    on: (pattern, callback, opts) => {
      const s: Sub = { pattern, cb: callback, opts, live: null }
      subs.add(s)
      bind(s)
      return () => {
        try {
          s.live?.()
        } catch {
          /* ignore */
        }
        subs.delete(s)
      }
    },
    set: (address, value, opts) => client.set(address, value, opts),
    cached: (address) => client.cached(address),
    get: (address) => client.get(address),
    onConnect: (cb) => {
      connectCbs.push(cb)
    },
    onDisconnect: (cb) => {
      disconnectCbs.push(cb)
    },
    onReconnect: (cb) => {
      reconnectCbs.push(cb)
    },
    onError: (cb) => {
      errorCbs.push(cb)
    },
    close: () => {
      closed = true
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      try {
        client.close()
      } catch {
        /* ignore */
      }
    },
    get connected() {
      return client.connected
    },
  }
}
