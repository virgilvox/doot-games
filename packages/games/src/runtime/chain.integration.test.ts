/**
 * End-to-end test for the PIPELINE foundation (P7): per-player content DERIVED from
 * a prior round's inputs, wired through a real RoomRuntime over an in-memory relay.
 * This is the engine capability a chain (Gartic Phone) is built on: round 1's
 * `assignContent` reads round 0's submissions (via the new `inputsFor`/`sources`
 * thread) and hands each player their LEFT neighbor's round-0 output, privately.
 *
 * Proves:
 *  - the engine threads `inputsFor` into `assignContent` (so prior inputs are
 *    reachable when the host lands on the round);
 *  - each player receives ONLY their own derived content, on their private address;
 *  - the rotation maps each player to the correct neighbor (chainSourceFor).
 */
import {
  type RelayCallback,
  type RelayClient,
  type RelayValue,
  type Unsubscribe,
  RoomRuntime,
  addr,
} from '@doot-games/engine'
import { afterEach, describe, expect, it } from 'vitest'
import { chainOrder, chainSourceFor } from './chain'

class FakeHub {
  store = new Map<string, RelayValue>()
  subs = new Set<{ pattern: string; cb: RelayCallback }>()
  set(address: string, value: RelayValue) {
    this.store.set(address, value)
    for (const s of this.subs) if (matches(s.pattern, address)) s.cb(value, address)
  }
  subscribe(pattern: string, cb: RelayCallback): Unsubscribe {
    const entry = { pattern, cb }
    this.subs.add(entry)
    for (const [a, v] of this.store) if (matches(pattern, a)) cb(v, a)
    return () => this.subs.delete(entry)
  }
}
function matches(pattern: string, address: string): boolean {
  const p = pattern.split('/')
  const a = address.split('/')
  if (p.length !== a.length) return false
  return p.every((seg, i) => seg === '*' || seg === a[i])
}
class FakeRelay implements RelayClient {
  connected = false
  private cbs: Array<() => void> = []
  constructor(private hub: FakeHub) {}
  async connect() {
    this.connected = true
    for (const cb of this.cbs) cb()
  }
  on(p: string, cb: RelayCallback) {
    return this.hub.subscribe(p, cb)
  }
  set(a: string, v: RelayValue) {
    this.hub.set(a, v)
  }
  cached(a: string) {
    return this.hub.store.get(a)
  }
  async get(a: string) {
    return this.hub.store.get(a) as RelayValue
  }
  onConnect(cb: () => void) {
    this.cbs.push(cb)
  }
  onDisconnect() {}
  onReconnect() {}
  onError() {}
  close() {}
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

describe('pipeline foundation: per-player content derived from a prior round', () => {
  it('hands each player their neighbor round-0 output through the real engine', async () => {
    const hub = new FakeHub()
    const room = 'CHN'
    const now = () => 0
    const host = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'host', now })
    cleanups.push(() => host.dispose())

    host.loadGame({
      meta: { pluginId: 'doodle', pluginVersion: '0', title: 'Chain', themeId: 'doot' },
      config: {
        title: 'Chain',
        rounds: [
          { block: 'make', content: {} },
          { block: 'chain', content: {} },
        ],
      } as unknown as RelayValue,
      rounds: [{ timer: null }, { timer: null }],
      // Round 1 only: derive each player's secret content from round 0's inputs.
      assignContent: (index, inputsFor) => {
        if (index !== 1) return undefined
        const players = host.recentPlayers()
        const order = chainOrder(
          players.map((p) => p.id),
          (x) => x, // sorted, stable ring
        )
        const prev = inputsFor(0)
        const perPlayer: Record<string, RelayValue> = {}
        for (const p of players) {
          const src = chainSourceFor(order, 1, p.id)
          perPlayer[p.id] = { received: (src ? prev.get(src) : null) ?? null } as RelayValue
        }
        return { perPlayer }
      },
    })

    const ada = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'player', name: 'Ada', now })
    const bo = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'player', name: 'Bo', now })
    const cy = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'player', name: 'Cy', now })
    cleanups.push(() => ada.dispose(), () => bo.dispose(), () => cy.dispose())
    await host.connect()
    await ada.connect()
    await bo.connect()
    await cy.connect()
    await flush()

    // Round 0: everyone makes their own thing.
    host.start()
    await flush()
    host.openVoting()
    ada.submit({ text: 'cat' })
    bo.submit({ text: 'dog' })
    cy.submit({ text: 'fish' })
    await flush()
    host.lock()
    host.reveal()
    await flush()

    // Advance to round 1: the engine runs assignContent(1, inputsFor) and publishes
    // each player's neighbor's round-0 output to their own private address.
    host.next()
    await flush()

    // Compute the expected rotation over the ACTUAL (hashed) player ids.
    const byId: Record<string, { text: string }> = {
      [ada.me.id]: { text: 'cat' },
      [bo.me.id]: { text: 'dog' },
      [cy.me.id]: { text: 'fish' },
    }
    const order = chainOrder([ada.me.id, bo.me.id, cy.me.id], (x) => x)
    for (const p of [ada, bo, cy]) {
      const got = p.perPlayerContentFor(1) as { received: { text: string } } | undefined
      const expectedSrc = chainSourceFor(order, 1, p.me.id) as string
      expect(got?.received).toEqual(byId[expectedSrc])
    }

    // No player receives another player's private content (it only ever lands on the
    // owner's own address; reading another's would require subscribing to it).
    const adaSrc = chainSourceFor(order, 1, ada.me.id) as string
    expect((ada.perPlayerContentFor(1) as { received: { text: string } }).received).toEqual(byId[adaSrc])
    expect(ada.perPlayerContentFor(1)).not.toEqual(bo.perPlayerContentFor(1))
  })
})
