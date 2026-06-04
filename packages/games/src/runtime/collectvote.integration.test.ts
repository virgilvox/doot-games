/**
 * Integration test for the share-and-vote loop wired exactly as the web app wires it:
 * a real RoomRuntime (host + two players) over an in-memory relay. Guards the risk the
 * block unit tests can't: that a player's shared PHOTO (a data URL submitted on the
 * normal block input channel) actually rides the relay to the host AND into the
 * photovote derive, and that the reveal credits the real sharer.
 *
 * This is the live-path verification for the collect/photovote feature (a browser smoke
 * would add the file-picker + gallery rendering, but this proves the data round-trip).
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
import { custom } from '../games/custom'
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

describe('collect -> photovote integration (host + players over a fake relay)', () => {
  it('rides a shared photo over the relay into the vote gallery and credits its sharer', async () => {
    const hub = new FakeHub()
    const now = () => 0
    const host = new RoomRuntime({ relay: new FakeRelay(hub), room: 'ABCD', role: 'host', now })
    cleanups.push(() => host.dispose())
    const config: GameComposition = {
      title: 'Share & Vote',
      rounds: [
        { block: 'collect', content: { prompt: 'Share a photo', kind: 'photo', timer: null } },
        { block: 'photovote', content: { prompt: 'Which photo wins?', options: [], timer: null, hideUntilReveal: true } },
      ],
    }
    const getPlayers = (): ScorePlayer[] =>
      host.recentPlayers().map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))
    await host.connect()
    host.loadGame({
      meta: { pluginId: 'custom', pluginVersion: '0', title: 'Share & Vote', themeId: 'doot' },
      config: config as unknown as RelayValue,
      rounds: [{ timer: null }, { timer: null }],
      deriveContent: buildDeriveContent(custom, config, 'ABCD', getPlayers) as never,
      revealSummary: buildRevealSummary(
        custom,
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

    // Round 0: collect. Each player shares a (fake) photo data URL over the input channel.
    host.start()
    host.openVoting()
    const adaPic = 'data:image/jpeg;base64,ADA_PHOTO'
    const boPic = 'data:image/jpeg;base64,BO_PHOTO'
    ada.submit({ media: adaPic } as RelayValue)
    bo.submit({ media: boPic } as RelayValue)
    await flush()
    host.lock()
    host.reveal()
    host.next() // derive the photovote round from the collected photos

    // The derive must have carried BOTH shared photos into the anonymized gallery.
    const vote = host.runtimeContentFor(1) as { options: Array<{ id: string; media: string }> }
    expect(vote?.options?.map((o) => o.media).sort()).toEqual([adaPic, boPic].sort())

    // Cross-vote using the host's private author map (each votes for the other).
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
      tallies: Array<{ media: string; votes: number; author: string }>
    }
    expect(reveal).toBeTruthy()
    // Every tallied photo is a real shared data URL credited to a real player.
    for (const t of reveal.tallies) {
      expect([adaPic, boPic]).toContain(t.media)
      expect(['Ada', 'Bo']).toContain(t.author)
    }
    // Each got one cross-vote, so both photos tallied a vote (self-votes excluded).
    expect(reveal.tallies.reduce((n, t) => n + t.votes, 0)).toBe(2)
  })
})
