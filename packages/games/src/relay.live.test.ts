/**
 * Live end-to-end smoke test against the real CLASP relay (wss://relay.clasp.to).
 *
 * It drives a host and a player headlessly through the engine, no browser, and
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
import { quipClash } from './games/quip-clash'
import { voteBox } from './games/votebox'
import {
  buildDeriveContent,
  buildRevealSummary,
  gameAnswerKeys,
  gameRounds,
  redactGameConfig,
  scoreGame,
} from './runtime/derive'

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
      // It must stay silent until reveal, that is the withholding invariant.
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
      // reached the viewer, it is only published at reveal.
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

describe.skipIf(!LIVE)('live relay two-phase (Quip Clash)', () => {
  it('derives anonymized vote options at runtime, withholds the author map until reveal, excludes self-votes', async () => {
    const room = makeRoomCode()
    const plugin = quipClash
    // A minimal one-pair config: a quip (make) round then a derived vote round.
    const config = {
      title: 'QC Live',
      rounds: [
        { block: 'quip', content: { prompt: 'Best snack?', placeholder: '', maxLength: 80, timer: null } },
        { block: 'vote', content: { prompt: 'Which wins?', options: [], mode: 'field', timer: null } },
      ],
    }
    const relays: RelayClient[] = []
    const mk = () => {
      const r = createClaspRelay(RELAY, { name: 'doot-test' })
      relays.push(r)
      return r
    }
    const host = createRoom({ relay: mk(), room, role: 'host' })
    const alice = createRoom({ relay: mk(), room, role: 'player', name: 'Alice' })
    const bob = createRoom({ relay: mk(), room, role: 'player', name: 'Bob' })
    const viewer = mk() // a raw relay reader, to prove the author map stays off the wire

    try {
      await host.connect()
      const getPlayers = () =>
        host.getSnapshot().players.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))
      host.loadGame({
        meta: { pluginId: plugin.manifest.id, pluginVersion: plugin.manifest.version, title: 'QC', themeId: 'doot' },
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

      await alice.connect()
      await bob.connect()
      await viewer.connect()
      await waitFor('both players ready', () => alice.getSnapshot().ready && bob.getSnapshot().ready)

      // Watch the vote round's derived content and its withheld author map.
      let voteContent: RelayValue = null
      let voteAnswer: RelayValue = null
      let voteReveal: RelayValue = null
      viewer.on(addr.roundContent(room, 1), (v) => {
        voteContent = v
      })
      viewer.on(addr.roundAnswer(room, 1), (v) => {
        voteAnswer = v
      })
      viewer.on(addr.roundReveal(room, 1), (v) => {
        voteReveal = v
      })

      host.start()
      await waitFor('host sees both players', () => host.getSnapshot().players.length >= 2)

      // Make round: both players write an answer.
      host.openVoting()
      await waitFor('alice sees make open', () => alice.getSnapshot().round.state === 'open')
      alice.submit({ text: 'tacos' })
      bob.submit({ text: 'waffles' })
      await waitFor('host has both answers', () => host.inputsFor(0).size >= 2)
      host.lock()
      host.reveal()

      // Advance to the derived vote round: anonymized options appear, author map does NOT.
      host.next()
      await waitFor('vote content derived', () => voteContent != null)
      const vc = voteContent as { options: Array<{ id: string; text: string }> }
      expect(vc.options.map((o) => o.text).sort()).toEqual(['tacos', 'waffles'])
      expect(JSON.stringify(voteContent)).not.toContain('authors') // anonymized
      expect(voteAnswer).toBe(null) // author map withheld until reveal
      await waitFor('players see vote options', () => (alice.runtimeContentFor(1) as { options?: unknown[] })?.options?.length === 2)

      // Cross-vote using the host's private author map (each votes the other's).
      const authors = (host.answerKeyFor(1) as { authors: Record<string, string> }).authors
      const optFor = (pid: string) => vc.options.find((o) => authors[o.id] === pid)!.id
      host.openVoting()
      await waitFor('alice sees vote open', () => alice.getSnapshot().round.state === 'open')
      alice.submit({ choice: optFor(bob.me.id) })
      bob.submit({ choice: optFor(alice.me.id) })
      await waitFor('host has both votes', () => host.inputsFor(1).size >= 2)

      host.lock()
      host.reveal()
      await waitFor('author map revealed', () => voteAnswer != null)
      expect((voteAnswer as { authors: Record<string, string> }).authors).toBeTruthy()
      await waitFor('reveal summary published', () => voteReveal != null)
      const summary = voteReveal as { tallies: Array<{ text: string; votes: number; author: string }> }
      // Each answer drew exactly one (cross) vote; authorship is now revealed.
      expect(summary.tallies.every((t) => t.votes === 1)).toBe(true)
      expect(summary.tallies.map((t) => t.author).sort()).toEqual(['Alice', 'Bob'])

      const results = scoreGame(
        plugin,
        { ...config, rounds: config.rounds.map((r, i) => ({ ...r, content: host.runtimeContentFor(i) ?? r.content })) },
        {
          inputsFor: (i) => host.inputsFor(i),
          players: getPlayers(),
          answerKeys: { 1: host.answerKeyFor(1) },
        },
      )
      host.finish(results as unknown as RelayValue)
      await waitFor('players see results', () => alice.getSnapshot().phase === 'results')
      expect((results as { leaderboard?: unknown[] }).leaderboard?.length).toBe(2)
    } finally {
      host.dispose()
      alice.dispose()
      bob.dispose()
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
