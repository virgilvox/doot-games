/**
 * End-to-end integration for the new cheap-wins games, wired exactly as the web
 * app wires the host (HostRoom.client.vue): a real RoomRuntime (host + players)
 * over an in-memory relay, with redactGameConfig / gameAnswerKeys / deriveContent
 * / revealSummary from the games layer. This guards the full loop that unit tests
 * of a block alone can't:
 *  - Ballpark: the answer-withholding invariant (the true number is NEVER on the
 *    relay before reveal, then the reveal publishes it) plus the needle reveal;
 *  - Most Likely To: the roster-derived vote reveal resolves real player names;
 *  - Hivemind: the free-text cluster reveal publishes through the engine.
 */
import {
  type RelayCallback,
  type RelayClient,
  type RelayValue,
  type Unsubscribe,
  RoomRuntime,
  addr,
} from '@doot-games/engine'
import type { GameComposition, GamePlugin, ScorePlayer } from '@doot-games/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { ballpark } from '../games/ballpark'
import { hivemind } from '../games/hivemind'
import { mostLikely } from '../games/most-likely'
import {
  buildDeriveContent,
  buildRevealSummary,
  gameAnswerKeys,
  gameRounds,
  redactGameConfig,
} from './derive'

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

/** Build a host wired exactly like HostRoom.client.vue, with a fresh roster getter. */
function makeHost(hub: FakeHub, plugin: GamePlugin, config: GameComposition, room: string) {
  const now = () => 0
  const host = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'host', now })
  cleanups.push(() => host.dispose())
  const getPlayers = (): ScorePlayer[] =>
    host.recentPlayers().map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))
  host.loadGame({
    meta: { pluginId: plugin.manifest.id, pluginVersion: '0', title: config.title, themeId: 'doot' },
    config: config as unknown as RelayValue,
    publishConfig: redactGameConfig(plugin, config) as unknown as RelayValue,
    rounds: gameRounds(plugin, config),
    answerKeys: gameAnswerKeys(plugin, config) as unknown as Record<number, RelayValue>,
    deriveContent: buildDeriveContent(plugin, config, room, getPlayers) as never,
    revealSummary: buildRevealSummary(
      plugin,
      config,
      getPlayers,
      (i) => host.runtimeContentFor(i),
      (i) => host.answerKeyFor(i),
    ) as never,
  })
  return host
}

function joinPlayer(hub: FakeHub, room: string, name: string) {
  const p = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'player', name, now: () => 0 })
  cleanups.push(() => p.dispose())
  return p
}

describe('Ballpark end-to-end (answer withholding + needle reveal)', () => {
  it('never puts the answer on the relay before reveal, then publishes it at reveal', async () => {
    const hub = new FakeHub()
    const room = 'BPRK'
    const config: GameComposition = {
      title: 'Ballpark',
      rounds: [
        { block: 'ballpark', content: { subject: '', prompt: 'How many?', image: '', unit: '', answer: 100, timer: null } },
      ],
    }
    const host = makeHost(hub, ballpark, config, room)
    await host.connect()
    const ada = joinPlayer(hub, room, 'Ada')
    const bo = joinPlayer(hub, room, 'Bo')
    await ada.connect()
    await bo.connect()
    await flush()

    host.start()
    host.openVoting()
    await flush()

    // INVARIANT: the config published to the relay must NOT carry the true answer.
    const published = hub.store.get(addr.config(room)) as {
      rounds: Array<{ content: { answer: number | null } }>
    }
    expect(published.rounds[0]!.content.answer).toBeNull()
    // And the answer key must not be published until reveal.
    expect(hub.store.get(addr.roundAnswer(room, 0))).toBeUndefined()
    // The host, however, holds the real answer privately for scoring.
    expect((host.answerKeyFor(0) as { answer: number }).answer).toBe(100)

    ada.submit({ value: 90 } as RelayValue) // error 10 (closest)
    bo.submit({ value: 130 } as RelayValue) // error 30
    await flush()
    host.lock()
    host.reveal()
    await flush()

    // Now the answer key is published (revealed), and the public needle summary names
    // the closest guesser.
    expect((hub.store.get(addr.roundAnswer(room, 0)) as { answer: number }).answer).toBe(100)
    const reveal = hub.store.get(addr.roundReveal(room, 0)) as {
      answer: number
      marks: Array<{ pid: string; name: string; value: number }>
      closestPid: string | null
    }
    expect(reveal.answer).toBe(100)
    expect(reveal.marks).toHaveLength(2)
    const closest = reveal.marks.find((m) => m.pid === reveal.closestPid)
    expect(closest?.name).toBe('Ada') // 90 is closer to 100 than 130
  })
})

describe('Most Likely To end-to-end (roster vote reveal)', () => {
  it('tallies nominations and crowns the room pick with a real name', async () => {
    const hub = new FakeHub()
    const room = 'MLTO'
    const config: GameComposition = {
      title: 'Most Likely To',
      rounds: [{ block: 'mostlikely', content: { prompt: 'Most likely to win', timer: null } }],
    }
    const host = makeHost(hub, mostLikely, config, room)
    await host.connect()
    const ada = joinPlayer(hub, room, 'Ada')
    const bo = joinPlayer(hub, room, 'Bo')
    const cy = joinPlayer(hub, room, 'Cy')
    await ada.connect()
    await bo.connect()
    await cy.connect()
    await flush()

    host.start()
    host.openVoting()
    await flush()

    // Ada and Bo both nominate Cy; Cy nominates Ada.
    ada.submit({ choice: cy.me.id, name: 'Cy' } as RelayValue)
    bo.submit({ choice: cy.me.id, name: 'Cy' } as RelayValue)
    cy.submit({ choice: ada.me.id, name: 'Ada' } as RelayValue)
    await flush()
    host.lock()
    host.reveal()
    await flush()

    const reveal = hub.store.get(addr.roundReveal(room, 0)) as {
      tallies: Array<{ pid: string; name: string; votes: number }>
      winnerName: string
    }
    expect(reveal.winnerName).toBe('Cy')
    expect(reveal.tallies[0]).toMatchObject({ name: 'Cy', votes: 2 })
  })
})

describe('Hivemind end-to-end (free-text cluster reveal)', () => {
  it('publishes the emergent clusters with the crowd answer on top', async () => {
    const hub = new FakeHub()
    const room = 'HIVE'
    const config: GameComposition = {
      title: 'Hivemind',
      rounds: [{ block: 'hivemind', content: { prompt: 'Name a fruit', placeholder: '', maxLength: 40, timer: null } }],
    }
    const host = makeHost(hub, hivemind, config, room)
    await host.connect()
    const ada = joinPlayer(hub, room, 'Ada')
    const bo = joinPlayer(hub, room, 'Bo')
    const cy = joinPlayer(hub, room, 'Cy')
    await ada.connect()
    await bo.connect()
    await cy.connect()
    await flush()

    host.start()
    host.openVoting()
    ada.submit({ text: 'Apple' } as RelayValue)
    bo.submit({ text: 'apple' } as RelayValue) // matches Ada (normalized)
    cy.submit({ text: 'banana' } as RelayValue)
    await flush()
    host.lock()
    host.reveal()
    await flush()

    const reveal = hub.store.get(addr.roundReveal(room, 0)) as {
      clusters: Array<{ label: string; count: number }>
      topLabel: string
    }
    expect(reveal.topLabel.toLowerCase()).toBe('apple')
    expect(reveal.clusters[0]).toMatchObject({ count: 2 })
  })
})
