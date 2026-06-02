/**
 * End-to-end test for the Faker game wired through a real RoomRuntime over an
 * in-memory relay, exactly as HostRoom.client.vue wires it. Proves:
 *  - the secret word reaches only each non-faker's private address, never a public
 *    one, before reveal;
 *  - the accuse round derives knowing who the faker is (via the source round's
 *    withheld answer key threaded into the derive context), with no word leaked;
 *  - the faker is unmasked at reveal and scoring crowns the right players.
 */
import {
  type RelayCallback,
  type RelayClient,
  type RelayValue,
  type Unsubscribe,
  RoomRuntime,
  addr,
} from '@doot-games/engine'
import type { ScorePlayer } from '@doot-games/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { faker } from '../games/faker'
import {
  buildAssignContent,
  buildDeriveContent,
  buildRevealSummary,
  gameAnswerKeys,
  gameRounds,
  redactGameConfig,
  scoreGame,
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

describe('Faker (hidden-role) end to end', () => {
  it('keeps the word private, derives the accuse round, unmasks at reveal, and scores', async () => {
    const hub = new FakeHub()
    const room = 'FKR1'
    const now = () => 0
    // A single-word game (one faker + accuse pair), deterministic via the seed.
    const config = faker.buildConfig!(room, { rounds: 1 })
    const seed = room
    const host = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'host', now })
    cleanups.push(() => host.dispose())
    const getPlayers = (): ScorePlayer[] =>
      host.recentPlayers().map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))

    host.loadGame({
      meta: { pluginId: 'faker', pluginVersion: '0.1.0', title: 'Faker', themeId: 'doot' },
      config: config as unknown as RelayValue,
      publishConfig: redactGameConfig(faker, config) as unknown as RelayValue,
      rounds: gameRounds(faker, config),
      answerKeys: gameAnswerKeys(faker, config) as unknown as Record<number, RelayValue>,
      deriveContent: buildDeriveContent(faker, config, seed, getPlayers, (i) => host.answerKeyFor(i)) as never,
      assignContent: buildAssignContent(faker, config, seed, getPlayers) as never,
      revealSummary: buildRevealSummary(
        faker,
        config,
        getPlayers,
        (i) => host.runtimeContentFor(i),
        (i) => host.answerKeyFor(i),
      ) as never,
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

    // Round 0 (faker make): the host assigns secret roles + collects clues.
    host.start()
    await flush()

    // The redacted/public config never carries the word.
    const publicCfg = hub.store.get(addr.config(room)) as { rounds: Array<{ content: { word?: string } }> }
    expect(publicCfg.rounds[0]?.content.word ?? '').toBe('')

    // Exactly one player is the faker (blank word); the others got the real word.
    const all = [ada, bo, cy]
    const secrets = all.map((r) => r.perPlayerContentFor(0) as { word: string; isFaker: boolean })
    expect(secrets.every(Boolean)).toBe(true)
    const fakers = secrets.filter((s) => s.isFaker)
    expect(fakers).toHaveLength(1)
    const fakerIdx = secrets.findIndex((s) => s.isFaker)
    const theWord = (secrets.find((s) => !s.isFaker) as { word: string }).word
    expect(theWord.length).toBeGreaterThan(0)
    expect(secrets[fakerIdx]?.word).toBe('')

    // The withheld answer (who the faker is) is host-side, not on a public address.
    const fakerPid = (host.answerKeyFor(0) as { fakerPid: string }).fakerPid
    expect(fakerPid).toBe(all[fakerIdx]?.me.id)
    expect(hub.store.get(addr.roundAnswer(room, 0))).toBeUndefined()

    // Everyone submits a one-word clue.
    host.openVoting()
    await flush()
    ada.submit({ clue: 'aaa' })
    bo.submit({ clue: 'bbb' })
    cy.submit({ clue: 'ccc' })
    await flush()
    host.lock()
    host.reveal()
    await flush()
    // The faker round's reveal must NOT leak who the faker is: a hidden-role
    // assignment stays host-side until the accuse round unmasks it. The host still
    // knows it locally (for the accuse derive + scoring), but it is not on the relay.
    expect(hub.store.get(addr.roundAnswer(room, 0))).toBeUndefined()
    expect((host.answerKeyFor(0) as { fakerPid: string }).fakerPid).toBe(fakerPid)

    // Round 1 (accuse judge): derived from the faker round.
    host.next()
    await flush()
    const accuse = host.runtimeContentFor(1) as { clues: Array<{ pid: string; clue: string }>; category: string }
    expect(accuse.clues.map((c) => c.pid).sort()).toEqual(all.map((r) => r.me.id).sort())
    // No word anywhere in the published accuse content.
    expect(JSON.stringify(accuse)).not.toContain(theWord)
    // The accuse answer key (host-side) knows the faker; not yet on the relay.
    expect((host.answerKeyFor(1) as { fakerPid: string; word: string })).toMatchObject({ fakerPid, word: theWord })
    expect(hub.store.get(addr.roundAnswer(room, 1))).toBeUndefined()

    // The two non-fakers both correctly accuse the faker.
    host.openVoting()
    await flush()
    const nonFakers = all.filter((_, i) => i !== fakerIdx)
    const fakerRuntime = all[fakerIdx]!
    for (const nf of nonFakers) nf.submit({ choice: fakerPid, name: 'Faker' })
    fakerRuntime.submit({ choice: nonFakers[0]!.me.id, name: nonFakers[0]!.name })
    await flush()
    host.lock()
    host.reveal()
    await flush()
    // The faker + word are unmasked at reveal.
    const ans = hub.store.get(addr.roundAnswer(room, 1)) as { fakerPid: string; word: string }
    expect(ans).toMatchObject({ fakerPid, word: theWord })

    // Score it like GameHost.finish: effective (runtime-derived) content + merged keys.
    const players = getPlayers()
    const effectiveCfg = {
      ...config,
      rounds: config.rounds.map((inst, i) => ({ ...inst, content: host.runtimeContentFor(i) ?? inst.content })),
    }
    const answerKeys: Record<number, unknown> = {}
    config.rounds.forEach((_, i) => {
      const a = host.answerKeyFor(i)
      if (a !== undefined) answerKeys[i] = a
    })
    const results = scoreGame(faker, effectiveCfg, {
      inputsFor: (i) => host.inputsFor(i) as Map<string, unknown>,
      players,
      answerKeys,
    })
    const score = (id: string) => results.leaderboard?.find((l) => l.id === id)?.score ?? 0
    // Both catchers score; the caught faker scores nothing.
    for (const nf of nonFakers) expect(score(nf.me.id)).toBe(100)
    expect(score(fakerPid)).toBe(0)
  })
})
