/**
 * Integration test for the two-phase loop wired exactly as the web app wires it:
 * a real RoomRuntime (host + two players) over an in-memory relay, with the
 * games-layer deriveContent/revealSummary closures. Guards the end-to-end path
 * that unit tests of the block alone can't: that the published per-round reveal
 * names the real author (regression for a "by Someone" name-resolution bug).
 */
import {
  type RelayCallback,
  type RelayClient,
  type RelayValue,
  type Unsubscribe,
  RoomRuntime,
  addr,
} from '@doot-games/engine'
import type { GameComposition, ScorePlayer } from '@doot-games/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { quipClash } from '../games/quipclash'
import { buildDeriveContent, buildRevealSummary } from './derive'

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

describe('two-phase integration (host + players over a fake relay)', () => {
  it('publishes a reveal that names the real author of the winning answer', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = new RoomRuntime({ relay: new FakeRelay(hub), room: 'ABCD', role: 'host', now })
    cleanups.push(() => host.dispose())
    const config: GameComposition = {
      title: 'QC',
      rounds: [
        { block: 'quip', content: { prompt: 'Best snack?', placeholder: '', maxLength: 80, timer: null } },
        { block: 'vote', content: { prompt: 'Which wins?', options: [], mode: 'field', timer: null } },
      ],
    }
    // Wire the host exactly like HostRoom.client.vue does.
    const getPlayers = (): ScorePlayer[] =>
      host.recentPlayers().map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))
    await host.connect()
    host.loadGame({
      meta: { pluginId: 'quip-clash', pluginVersion: '0', title: 'QC', themeId: 'doot' },
      config: config as unknown as RelayValue,
      rounds: [{ timer: null }, { timer: null }],
      deriveContent: buildDeriveContent(quipClash, config, 'ABCD', getPlayers) as never,
      revealSummary: buildRevealSummary(
        quipClash,
        config,
        getPlayers,
        (i) => host.runtimeContentFor(i),
        (i) => host.answerKeyFor(i),
      ) as never,
    })

    const ada = new RoomRuntime({ relay: new FakeRelay(hub), room: 'ABCD', role: 'player', name: 'Ada', now })
    const bo = new RoomRuntime({ relay: new FakeRelay(hub), room: 'ABCD', role: 'player', name: 'Bo', now })
    cleanups.push(() => ada.dispose(), () => bo.dispose())
    await ada.connect()
    await bo.connect()
    await flush()

    host.start()
    host.openVoting()
    ada.submit({ text: 'tacos' } as RelayValue)
    bo.submit({ text: 'waffles' } as RelayValue)
    await flush()
    host.lock()
    host.reveal()
    host.next() // derive the vote round from the quip answers

    // Cross-vote (each for the other) using the host's private author map.
    const authors = (host.answerKeyFor(1) as { authors: Record<string, string> }).authors
    const optOf = (pid: string) => Object.keys(authors).find((id) => authors[id] === pid) as string
    host.openVoting()
    await flush()
    ada.submit({ choice: optOf(bo.me.id) } as RelayValue)
    bo.submit({ choice: optOf(ada.me.id) } as RelayValue)
    await flush()
    host.lock()
    host.reveal()

    const reveal = hub.store.get(addr.roundReveal('ABCD', 1)) as {
      tallies: Array<{ text: string; votes: number; author: string }>
    }
    expect(reveal).toBeTruthy()
    // Every tallied answer must be attributed to a real player name, never "Someone".
    for (const t of reveal.tallies) {
      expect(['Ada', 'Bo']).toContain(t.author)
    }
  })
})
