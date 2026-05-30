/**
 * The two-phase (make → judge) pattern.
 *
 * This is the engine feature behind the flagship games. A "make" round collects
 * free-text from every player (kept private, off the relay until judging); the
 * next "judge" round's content is DERIVED at runtime from those submissions,
 * shuffled and anonymized, and published only when the room reaches it. Authors
 * score by vote share. Answer-withholding and the relay-only rule are preserved.
 *
 * You get this purely by COMPOSING the `quip` (make) and `vote` (judge) blocks,
 * no engine code. The vote round's content starts empty and is filled at runtime:
 * the engine calls the vote block's `derive` with the prior round's inputs.
 *
 * `RoundInstance.from` picks which earlier round feeds a derived round (defaults
 * to the previous round, which is what we want here).
 *
 * This is essentially Quip Clash. Mad Libs swaps `quip` for `fill`; Split the
 * Room swaps `vote` for `split`. The vote block renders any make-submission to
 * votable text via the make block's `toVoteText` (Quip = its text; a Mad Lib =
 * its filled-in story), so the pattern composes across make blocks.
 */
import { quipBlock, seededShuffle, voteBlock } from '@doot-games/games'
import { type GameComposition, defineGame } from '@doot-games/sdk'

const PROMPT_POOL: string[] = [
  'The worst possible name for a boat: ___',
  'A terrible motivational poster slogan: ___',
  'What you should NOT say in a job interview: ___',
  'The real reason the wifi is down: ___',
  'A rejected ice-cream flavor: ___',
  // ...the bigger the pool, the more replayable.
]
const ROUNDS = 3

function pair(prompt: string): GameComposition['rounds'] {
  return [
    // MAKE: everyone writes an answer (free text). Withheld from other players.
    { block: 'quip', content: { prompt, placeholder: '', maxLength: 80, timer: 60 } },
    // JUDGE: content starts empty; the engine derives the anonymized, shuffled
    // answers from the previous round at vote time. `from` defaults to [index-1].
    { block: 'vote', content: { prompt: 'Which answer wins?', options: [], mode: 'field', timer: 30 } },
  ]
}

export const quipClashLite = defineGame({
  manifest: {
    id: 'quip-clash-lite',
    name: 'Quip Clash Lite',
    version: '0.1.0',
    description: 'Answer a prompt, then vote for the funniest answer. The room writes the jokes.',
    author: 'you',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true, // a ready-to-play Game From Doot (it has a buildConfig pool)
  },
  blocks: [quipBlock, voteBlock],
  defaultConfig: { title: 'Quip Clash Lite', rounds: PROMPT_POOL.slice(0, ROUNDS).flatMap(pair) },
  buildConfig: (seed: string): GameComposition => ({
    title: 'Quip Clash Lite',
    rounds: seededShuffle(`quip:${seed}`)(PROMPT_POOL).slice(0, ROUNDS).flatMap(pair),
  }),
})
