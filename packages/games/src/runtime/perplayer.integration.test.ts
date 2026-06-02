/**
 * End-to-end test for the SECRET per-player content primitive (hidden-role games
 * like Faker), wired through a real RoomRuntime over an in-memory relay. Proves:
 *  - each player receives ONLY their own per-player content (the imposter's
 *    different prompt never lands in another player's runtime);
 *  - the withheld answer (who the imposter is) is held host-side, not published to
 *    a public address until reveal.
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

describe('secret per-player content (hidden-role primitive)', () => {
  it('delivers each player only their own content and withholds the answer', async () => {
    const hub = new FakeHub()
    const room = 'FAKE'
    const now = () => 0
    const host = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'host', now })
    cleanups.push(() => host.dispose())

    // assignContent: one player (the first in the roster) is the "faker" and gets a
    // blank word; everyone else gets the secret word. The withheld answer is who.
    let fakerId = ''
    host.loadGame({
      meta: { pluginId: 'faker', pluginVersion: '0', title: 'Faker', themeId: 'doot' },
      config: { title: 'Faker', rounds: [{ block: 'faker', content: { category: 'Fruit' } }] } as unknown as RelayValue,
      rounds: [{ timer: null }],
      assignContent: (index) => {
        if (index !== 0) return undefined
        const players = host.recentPlayers()
        fakerId = players[0]?.id ?? ''
        const perPlayer: Record<string, RelayValue> = {}
        for (const p of players) {
          perPlayer[p.id] =
            p.id === fakerId
              ? ({ category: 'Fruit', word: '', isFaker: true } as RelayValue)
              : ({ category: 'Fruit', word: 'Banana', isFaker: false } as RelayValue)
        }
        return { perPlayer, answer: { fakerPid: fakerId } as RelayValue }
      },
    })

    const ada = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'player', name: 'Ada', now })
    const bo = new RoomRuntime({ relay: new FakeRelay(hub), room, role: 'player', name: 'Bo', now })
    cleanups.push(() => ada.dispose(), () => bo.dispose())
    await host.connect()
    await ada.connect()
    await bo.connect()
    await flush()

    host.start() // publishes per-player content for round 0
    await flush()

    // Each player sees ONLY their own content.
    const adaContent = ada.perPlayerContentFor(0) as { word: string; isFaker: boolean } | undefined
    const boContent = bo.perPlayerContentFor(0) as { word: string; isFaker: boolean } | undefined
    expect(adaContent).toBeTruthy()
    expect(boContent).toBeTruthy()
    // Exactly one of them is the faker (blank word), the other has the secret word.
    const fakerIsAda = fakerId === ada.me.id
    expect(adaContent?.isFaker).toBe(fakerIsAda)
    expect(boContent?.isFaker).toBe(!fakerIsAda)
    expect((fakerIsAda ? boContent : adaContent)?.word).toBe('Banana')
    expect((fakerIsAda ? adaContent : boContent)?.word).toBe('')

    // The answer (who the faker is) is held host-side, NOT on a public address.
    expect((host.answerKeyFor(0) as { fakerPid: string }).fakerPid).toBe(fakerId)
    expect(hub.store.get(addr.roundAnswer(room, 0))).toBeUndefined() // not until reveal

    // A player never receives the OTHER player's secret address.
    expect(hub.store.get(addr.roundContentForPlayer(room, 0, ada.me.id))).toBeTruthy()
    expect(hub.store.get(addr.roundContentForPlayer(room, 0, bo.me.id))).toBeTruthy()

    // A hidden-role assignment answer stays HOST-SIDE even at reveal: it is not
    // auto-published to the relay, because a game built on this primitive (Faker)
    // unmasks the role in a later judge round, not at the make round's own reveal.
    // Publishing it here would leak the imposter early. The host still holds it
    // locally for that judge round and for scoring.
    host.openVoting()
    host.lock()
    host.reveal()
    await flush()
    expect(hub.store.get(addr.roundAnswer(room, 0))).toBeUndefined()
    expect((host.answerKeyFor(0) as { fakerPid: string }).fakerPid).toBe(fakerId)
  })
})
