import { encodeFrame } from '@clasp-to/core'
import { describe, expect, it } from 'vitest'
import {
  type AssetTransport,
  BLOB_REF_KEY,
  CLASP_FRAME_LIMIT_BYTES,
  OFFLOAD_THRESHOLD_BYTES,
  claspEncodedSize,
  decodeValue,
  encodeValue,
  isBlobEnvelope,
} from './blob'
import { type ClaspLike, type RelayValue, createClaspRelay } from './relay'

/**
 * A drivable fake CLASP client that faithfully enforces the 65535-byte frame
 * ceiling using the SAME size measure the engine gates on (which is a safe upper
 * bound on CLASP's real encoder): like `encodeFrame`, `set` THROWS synchronously
 * when the value is too big. A passing publish therefore proves the value fits.
 */
class SizeEnforcingClasp implements ClaspLike {
  connected = false
  store = new Map<string, RelayValue>()
  private subs = new Set<{ pattern: string; cb: (v: RelayValue, a: string) => void }>()
  private connectCbs: Array<() => void> = []
  sets: Array<{ address: string; value: RelayValue }> = []

  async connect() {
    this.connected = true
    for (const cb of this.connectCbs) cb()
  }
  close() {
    this.connected = false
  }
  on(pattern: string, cb: (v: RelayValue, a: string) => void) {
    const entry = { pattern, cb }
    this.subs.add(entry)
    for (const [address, value] of this.store) if (match(pattern, address)) cb(value, address)
    return () => this.subs.delete(entry)
  }
  set(address: string, value: RelayValue) {
    const bytes = claspEncodedSize(value)
    if (bytes > CLASP_FRAME_LIMIT_BYTES) {
      throw new Error(`Payload too large: ${bytes} bytes (max ${CLASP_FRAME_LIMIT_BYTES})`)
    }
    this.sets.push({ address, value })
    this.store.set(address, value)
    for (const s of this.subs) if (match(s.pattern, address)) s.cb(value, address)
  }
  get(address: string) {
    return Promise.resolve(this.store.get(address) as RelayValue)
  }
  cached(address: string) {
    return this.store.get(address)
  }
  onConnect(cb: () => void) {
    this.connectCbs.push(cb)
  }
  onDisconnect() {}
  onReconnect() {}
  onError() {}
}

function match(pattern: string, address: string): boolean {
  const p = pattern.split('/')
  const a = address.split('/')
  return p.length === a.length && p.every((seg, i) => seg === '*' || seg === a[i])
}

function makeFakeAssets(): AssetTransport & { uploads: number; objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  let uploads = 0
  return {
    get uploads() {
      return uploads
    },
    objects,
    async upload(bytes) {
      uploads++
      const url = `mem://blob/${uploads}`
      objects.set(url, bytes)
      return url
    },
    async resolve(url) {
      const b = objects.get(url)
      if (!b) throw new Error(`missing object ${url}`)
      return b
    },
  }
}

/** A value that encodes to at least `bytes` (a stand-in for a big recap). */
function bigValue(bytes: number): RelayValue {
  return { blob: 'x'.repeat(bytes) }
}

const OVER_THRESHOLD = 60_000 // > OFFLOAD_THRESHOLD_BYTES, still under the frame ceiling
const OVER_FRAME = 70_000 // > 65535: would throw if published inline

/** Let queued microtasks + resolve retry timers settle. */
const flush = (ms = 50) => new Promise((r) => setTimeout(r, ms))

describe('blob helpers', () => {
  it('detects envelopes and rejects lookalikes', () => {
    expect(isBlobEnvelope({ [BLOB_REF_KEY]: { url: 'u', n: 1, ct: 'application/json' } })).toBe(true)
    expect(isBlobEnvelope({ [BLOB_REF_KEY]: { url: 'u' } })).toBe(false)
    expect(isBlobEnvelope({ hello: 'world' })).toBe(false)
    expect(isBlobEnvelope('a string')).toBe(false)
    expect(isBlobEnvelope(42)).toBe(false)
    expect(isBlobEnvelope(null as unknown as RelayValue)).toBe(false)
    expect(isBlobEnvelope([1, 2, 3] as unknown as RelayValue)).toBe(false)
  })

  it('round-trips values through encode/decode', () => {
    const v = { a: 1, b: [1, 2, 3], c: { d: 'x' } }
    expect(decodeValue(encodeValue(v))).toEqual(v)
  })

  it('claspEncodedSize counts numbers at 9 bytes (bigger than JSON), the whole point', () => {
    // 100 floats: JSON ~700 bytes, but CLASP stores each as a tagged float64.
    const drawing = { points: Array.from({ length: 100 }, (_, i) => i / 100) }
    const size = claspEncodedSize(drawing)
    expect(size).toBeGreaterThanOrEqual(100 * 9) // >= 900, not ~700
  })

  it('claspEncodedSize measures strings in UTF-8 bytes', () => {
    expect(claspEncodedSize('hi')).toBeGreaterThanOrEqual(2)
    expect(claspEncodedSize({ x: 'a'.repeat(100) })).toBeGreaterThan(100)
  })
})

describe('CLASP frame ceiling (the real limit we design against)', () => {
  it('encodeFrame throws just past 65535 bytes and accepts just under', () => {
    expect(() => encodeFrame(new Uint8Array(CLASP_FRAME_LIMIT_BYTES))).not.toThrow()
    expect(() => encodeFrame(new Uint8Array(CLASP_FRAME_LIMIT_BYTES + 1))).toThrow(/Payload too large/)
  })

  it('the offload threshold leaves real headroom under the ceiling', () => {
    expect(OFFLOAD_THRESHOLD_BYTES).toBeLessThan(CLASP_FRAME_LIMIT_BYTES)
    expect(CLASP_FRAME_LIMIT_BYTES - OFFLOAD_THRESHOLD_BYTES).toBeGreaterThanOrEqual(5_000)
    expect(() => encodeFrame(new Uint8Array(OFFLOAD_THRESHOLD_BYTES))).not.toThrow()
  })
})

describe('createClaspRelay Claim-Check', () => {
  async function wired(assets?: AssetTransport) {
    const clasp = new SizeEnforcingClasp()
    const relay = createClaspRelay('mem://relay', {}, { makeClient: () => clasp, assets })
    await relay.connect()
    return { clasp, relay }
  }

  it('publishes a small value inline and never touches the store', async () => {
    const assets = makeFakeAssets()
    const { clasp, relay } = await wired(assets)
    await relay.set('room/ABCD/x', { hello: 'world' })
    expect(assets.uploads).toBe(0)
    expect(clasp.sets.at(-1)?.value).toEqual({ hello: 'world' })
  })

  it('offloads a frame-busting value to a tiny reference (would otherwise throw)', async () => {
    const assets = makeFakeAssets()
    const { clasp, relay } = await wired(assets)
    const value = bigValue(OVER_FRAME)

    // Without offload the enforcing fake throws "Payload too large".
    await relay.set('room/ABCD/results', value)

    expect(assets.uploads).toBe(1)
    const published = clasp.sets.at(-1)?.value as RelayValue
    expect(isBlobEnvelope(published)).toBe(true)
    expect(claspEncodedSize(published)).toBeLessThan(1_000)
  })

  it('offloads a value just over the threshold too', async () => {
    const assets = makeFakeAssets()
    const { clasp, relay } = await wired(assets)
    await relay.set('room/ABCD/results', bigValue(OVER_THRESHOLD))
    expect(assets.uploads).toBe(1)
    expect(isBlobEnvelope(clasp.sets.at(-1)?.value as RelayValue)).toBe(true)
  })

  it('resolves the reference back to the original value for subscribers', async () => {
    const assets = makeFakeAssets()
    const { relay } = await wired(assets)
    const value = { threads: bigValue(OVER_FRAME), headline: 'The chains are in' }

    const seen: RelayValue[] = []
    relay.on('room/ABCD/results', (v) => seen.push(v))
    await relay.set('room/ABCD/results', value)
    await flush()

    expect(seen.at(-1)).toEqual(value)
    expect(seen.some((v) => isBlobEnvelope(v))).toBe(false)
  })

  it('resolves for a LATE subscriber via the retained snapshot', async () => {
    const assets = makeFakeAssets()
    const { relay } = await wired(assets)
    const value = { threads: bigValue(OVER_FRAME) }
    await relay.set('room/ABCD/results', value)

    const seen: RelayValue[] = []
    relay.on('room/ABCD/results', (v) => seen.push(v))
    await flush()
    expect(seen.at(-1)).toEqual(value)
  })

  it('round-trips an oversized value through get()', async () => {
    const assets = makeFakeAssets()
    const { relay } = await wired(assets)
    const value = { threads: bigValue(OVER_FRAME) }
    await relay.set('room/ABCD/results', value)
    expect(await relay.get('room/ABCD/results')).toEqual(value)
  })

  it('cached() reports a miss for an offloaded value so callers use get()', async () => {
    const assets = makeFakeAssets()
    const { relay } = await wired(assets)
    await relay.set('room/ABCD/small', { a: 1 })
    await relay.set('room/ABCD/big', bigValue(OVER_FRAME))
    expect(relay.cached('room/ABCD/small')).toEqual({ a: 1 })
    expect(relay.cached('room/ABCD/big')).toBeUndefined()
  })

  it('fails early with a friendly message when oversized and no store is configured', async () => {
    const { relay } = await wired(undefined)
    let threw: Error | null = null
    try {
      await relay.set('room/ABCD/results', bigValue(OVER_THRESHOLD))
    } catch (e) {
      threw = e as Error
    }
    expect(threw).toBeTruthy()
    expect(threw?.message).toMatch(/too large to broadcast/i)
    expect(threw?.message).not.toMatch(/Payload too large/)
  })

  it('surfaces a resolve failure via onError without delivering a bogus value', async () => {
    const assets = makeFakeAssets()
    const { relay } = await wired(assets)
    const value = { threads: bigValue(OVER_FRAME) }
    await relay.set('room/ABCD/results', value)
    assets.objects.clear()
    const errors: unknown[] = []
    relay.onError((e) => errors.push(e))
    const seen: RelayValue[] = []
    relay.on('room/ABCD/results', (v) => seen.push(v))
    await flush(500)
    expect(seen).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })
})
