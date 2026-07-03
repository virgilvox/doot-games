/**
 * The Doodle Chain bug, reproduced and fixed at the engine choke point.
 *
 * A chain game's results value bundles every player's drawing; past ~64 KB the
 * CLASP frame's uint16 length prefix overflows and `encodeFrame` throws
 * `Payload too large`, stranding the room on the results step. This wires a real
 * RoomRuntime host to the real `createClaspRelay` Claim-Check wrapper over a fake
 * CLASP client that faithfully enforces the 65535-byte ceiling, and asserts that
 * `finish()` with an oversized results value now succeeds (offloaded) instead of
 * throwing, and that the value round-trips back to the original for a subscriber.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { addr } from './addresses'
import { type AssetTransport, CLASP_FRAME_LIMIT_BYTES, claspEncodedSize, isBlobEnvelope } from './blob'
import type { ClaspLike, RelayValue } from './relay'
import { createClaspRelay } from './relay'
import { RoomRuntime } from './room'

/** A fake CLASP client that throws on an oversized value, exactly like encodeFrame. */
class EnforcingClasp implements ClaspLike {
  connected = false
  store = new Map<string, RelayValue>()
  private subs = new Set<{ pattern: string; cb: (v: RelayValue, a: string) => void }>()
  private connectCbs: Array<() => void> = []
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

function memAssets(): AssetTransport {
  const objects = new Map<string, Uint8Array>()
  let n = 0
  return {
    async upload(bytes) {
      const url = `mem://blob/${++n}`
      objects.set(url, bytes)
      return url
    },
    async resolve(url) {
      const b = objects.get(url)
      if (!b) throw new Error(`missing ${url}`)
      return b
    },
  }
}

const GAME = {
  meta: { pluginId: 'doodle-chain', pluginVersion: '0', title: 'Doodle Chain', themeId: 'doot' },
  config: { title: 'Doodle Chain', slides: [{}] } as RelayValue,
  rounds: [{ timer: null }],
}

/** A results value shaped like a Doodle Chain unspool: many full drawings. */
function bigDoodleResults(drawings: number): RelayValue {
  const stroke = { color: '#1f2430', size: 0.012, points: Array.from({ length: 400 }, (_, i) => (i % 100) / 100) }
  const threads = Array.from({ length: drawings }, (_, i) => [
    { step: 1, name: `Player ${i}`, mode: 'describe', text: 'a cat riding a bike' },
    { step: 2, name: `Player ${i + 1}`, mode: 'draw', drawing: { strokes: Array.from({ length: 8 }, () => stroke) } },
  ])
  return { headline: `${drawings} doodle chains unspooled`, recap: { threads, aspect: 0.7 } }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

async function hostOn(clasp: EnforcingClasp, assets?: AssetTransport) {
  const relay = createClaspRelay('mem://relay', {}, { makeClient: () => clasp, assets })
  const host = new RoomRuntime({ relay, room: 'ABCD', role: 'host', now: () => 0 })
  cleanups.push(() => host.dispose())
  await host.connect()
  host.loadGame(GAME)
  host.start()
  host.openVoting()
  host.lock()
  host.reveal()
  return host
}

describe('results offload (the Doodle Chain payload-too-large fix)', () => {
  it('first: an oversized results value really does overflow a frame without offload', () => {
    const results = bigDoodleResults(30)
    expect(claspEncodedSize(results)).toBeGreaterThan(CLASP_FRAME_LIMIT_BYTES)
  })

  it('finish() offloads an oversized results value instead of throwing', async () => {
    const clasp = new EnforcingClasp()
    const host = await hostOn(clasp, memAssets())

    // Without the Claim-Check this call throws "Payload too large" and strands the room.
    await host.finish(bigDoodleResults(30))

    expect(clasp.store.get(addr.phase('ABCD'))).toBe('results')
    const published = clasp.store.get(addr.resultsSummary('ABCD')) as RelayValue
    expect(isBlobEnvelope(published)).toBe(true) // a tiny reference, not the blob
    expect(claspEncodedSize(published)).toBeLessThan(CLASP_FRAME_LIMIT_BYTES)
  })

  it('a subscriber resolves the offloaded results back to the full value', async () => {
    const clasp = new EnforcingClasp()
    const assets = memAssets()
    const host = await hostOn(clasp, assets)
    const results = bigDoodleResults(30)

    // A late viewer (e.g. a phone) subscribing to results via its own wrapped relay.
    const viewer = createClaspRelay('mem://relay', {}, { makeClient: () => clasp, assets })
    await viewer.connect()

    await host.finish(results)
    const seen: RelayValue[] = []
    viewer.on(addr.resultsSummary('ABCD'), (v) => seen.push(v))
    await new Promise((r) => setTimeout(r, 30))

    expect(seen.at(-1)).toEqual(results) // the whole filmstrip, not an envelope
  })

  it('without object storage, finish() surfaces a friendly error and does NOT strand on empty results', async () => {
    const clasp = new EnforcingClasp()
    const host = await hostOn(clasp, undefined) // no asset transport

    await host.finish(bigDoodleResults(30))

    // The phase did NOT flip to results (better to stay in play than show nothing).
    expect(clasp.store.get(addr.phase('ABCD'))).not.toBe('results')
    // A clear, actionable message is surfaced (not the raw CLASP crash).
    const err = host.getSnapshot().error
    expect(err).toMatch(/too large to broadcast/i)
    expect(err).not.toMatch(/Payload too large/)
  })

  it('a normal-size results value still publishes inline (no storage needed)', async () => {
    const clasp = new EnforcingClasp()
    const host = await hostOn(clasp, undefined)
    await host.finish({ headline: 'GG', recap: { threads: [], aspect: 0.7 } })
    expect(clasp.store.get(addr.phase('ABCD'))).toBe('results')
    expect(isBlobEnvelope(clasp.store.get(addr.resultsSummary('ABCD')) as RelayValue)).toBe(false)
  })
})
