/**
 * Live end-to-end smoke test against the real CLASP relay (wss://relay.clasp.to).
 *
 * It drives a host and a player headlessly through the engine — no browser — and
 * asserts the core architecture claims actually hold over the wire:
 *   - a player joins by name and receives the published (redacted) config;
 *   - answer keys are WITHHELD until reveal (the security invariant);
 *   - the host sees the player join, and a submitted input round-trips back;
 *   - the game can be played to results.
 *
 * It is gated behind `DOOT_LIVE=1` so the default `pnpm test` stays offline and
 * deterministic. Run it explicitly:
 *
 *   DOOT_LIVE=1 pnpm vitest run packages/games/src/relay.live.test.ts
 */
import { type RelayClient, type RelayValue, addr, createClaspRelay, createRoom, makeRoomCode } from '@doot-games/engine'
import { describe, expect, it } from 'vitest'
import { gameAnswerKeys, gameRounds, redactGameConfig, scoreGame } from './runtime/derive'
import { voteBox } from './games/votebox'

const LIVE = process.env.DOOT_LIVE === '1'
const RELAY = process.env.DOOT_RELAY_URL ?? 'wss://relay.clasp.to'

async function waitFor(label: string, fn: () => boolean, timeout = 12_000, interval = 150): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`timed out waiting for: ${label}`)
}

describe.skipIf(!LIVE)('live relay end-to-end (VoteBox)', () => {
  it('joins a player, withholds answers until reveal, round-trips an input, and reaches results', async () => {
    const room = makeRoomCode()
    const plugin = voteBox
    const config = plugin.defaultConfig
    const relays: RelayClient[] = []
    const mk = () => {
      const r = createClaspRelay(RELAY, { name: 'doot-test' })
      relays.push(r)
      return r
    }

    const host = createRoom({ relay: mk(), room, role: 'host' })
    const player = createRoom({ relay: mk(), room, role: 'player', name: 'Alice' })
    const viewer = mk() // an unprivileged reader, to prove the relay never serves answers early

    try {
      await host.connect()
      host.loadGame({
        meta: { pluginId: plugin.manifest.id, pluginVersion: plugin.manifest.version, title: 'Test', themeId: 'doot' },
        config: config as unknown as RelayValue,
        publishConfig: redactGameConfig(plugin, config) as unknown as RelayValue,
        rounds: gameRounds(plugin, config),
        answerKeys: gameAnswerKeys(plugin, config) as unknown as Record<number, RelayValue>,
      })

      // Player joins in the lobby and publishes its profile.
      await player.connect()
      await waitFor('player ready', () => player.getSnapshot().ready)
      await viewer.connect()

      // Subscribe an unprivileged viewer to round 0's answer address up front.
      // It must stay silent until reveal — that is the withholding invariant.
      let round0Answer: RelayValue = null
      viewer.on(addr.roundAnswer(room, 0), (v) => {
        round0Answer = v
      })

      // Start the game; the player should receive the redacted config.
      host.start()
      await waitFor('player has config', () => player.getSnapshot().config != null)
      const playerConfig = player.getSnapshot().config as unknown as typeof config
      const guessContent = playerConfig.rounds[0]!.content as { correct: number }
      expect(guessContent.correct).toBe(-1) // answer stripped in the published config

      // Host sees the player join.
      await waitFor('host sees Alice', () => host.getSnapshot().players.some((p) => p.name === 'Alice'))

      // Open round 0, the player submits, and the host receives it over the relay.
      host.openVoting()
      await waitFor('player sees open', () => player.getSnapshot().round.state === 'open')
      player.submit({ choice: 0 })
      await waitFor('host received input', () => host.inputsFor(0).get(player.me.id) != null)
      expect((host.inputsFor(0).get(player.me.id) as { choice: number }).choice).toBe(0)

      // After a full round-trip of other traffic, the answer still must not have
      // reached the viewer — it is only published at reveal.
      expect(round0Answer).toBe(null)
      host.lock()
      host.reveal()
      await waitFor('answer revealed after reveal', () => round0Answer != null)
      expect((round0Answer as { correct: number }).correct).toBe(0)

      // Play out the remaining round and finish.
      host.next()
      await waitFor('player at round 1', () => player.getSnapshot().round.index === 1)
      host.openVoting()
      await waitFor('player sees round 1 open', () => player.getSnapshot().round.state === 'open')
      player.submit({ ratings: { craft: 8, style: 7 } })
      await waitFor('host received round 1 input', () => host.inputsFor(1).get(player.me.id) != null)
      host.lock()
      host.reveal()

      const results = scoreGame(plugin, config, {
        inputsFor: (i) => host.inputsFor(i),
        players: host.getSnapshot().players.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex })),
        answerKeys: gameAnswerKeys(plugin, config) as Record<number, unknown>,
      })
      host.finish(results as unknown as RelayValue)
      await waitFor('player sees results', () => player.getSnapshot().phase === 'results')
      expect(player.getSnapshot().results).toBeTruthy()
    } finally {
      host.dispose()
      player.dispose()
      for (const r of relays) {
        try {
          r.close()
        } catch {
          /* ignore */
        }
      }
    }
  }, 60_000)
})
