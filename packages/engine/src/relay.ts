/**
 * The relay client. The engine talks to CLASP through this small interface so
 * that the room runtime never imports the relay SDK directly and tests can
 * inject a fake. `createClaspRelay` wraps `@clasp-to/core` (the core build —
 * Doot only needs publish/subscribe with persistence and TTL).
 */
import { Clasp, type ConnectOptions, type Unsubscribe, type Value } from '@clasp-to/core'

export type RelayValue = Value
export type { Unsubscribe }

export const DEFAULT_RELAY_URL = 'wss://relay.clasp.to'

/**
 * Default absolute TTL on every published value (8 hours), in microseconds —
 * the relay's TTL unit — so the public relay does not accumulate dead rooms.
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

/** Wrap `@clasp-to/core` as a {@link RelayClient}. */
export function createClaspRelay(
  url: string = DEFAULT_RELAY_URL,
  options: ConnectOptions = {},
): RelayClient {
  const c = new Clasp(url, { reconnect: true, ...options })
  return {
    connect: () => c.connect(),
    on: (pattern, callback, opts) => c.on(pattern, (value, address) => callback(value, address), opts),
    set: (address, value, opts) => c.set(address, value, opts),
    cached: (address) => c.cached(address),
    get: (address) => c.get(address),
    onConnect: (cb) => c.onConnect(cb),
    onDisconnect: (cb) => c.onDisconnect(cb),
    onReconnect: (cb) => c.onReconnect(() => cb()),
    onError: (cb) => c.onError(cb),
    close: () => c.close(),
    get connected() {
      return c.connected
    },
  }
}
