/**
 * Quip Clash, the first flagship and the proof of the two-phase loop: a prompt
 * (quip) round collects everyone's free-text answer, then a derived vote round
 * shows the anonymized, shuffled answers for the room to judge. Authors score by
 * vote share; the final round is doubled. Each play draws a fresh set of prompts
 * from a large pool (`buildConfig`), so no two rooms get the same game.
 *
 * It is pure composition, [quip, vote, quip, vote, ...], with no custom views.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { quipBlock } from '../../blocks/quip/block'
import { voteBlock } from '../../blocks/vote/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

/** A pool of fill-the-blank prompts. The "___" is where players write. */
const PROMPT_POOL: string[] = [
  'The worst possible name for a cruise ship: ___',
  'A terrible thing to shout during a quiet moment: ___',
  'The real reason the dinosaurs went extinct: ___',
  'An awful slogan for a dentist: ___',
  "What you'd find in a superhero's trash can: ___",
  'The most useless superpower imaginable: ___',
  'A bad thing to hear from your pilot: ___',
  'The next big breakfast cereal mascot: ___',
  'A rejected flavor of toothpaste: ___',
  'The worst advice to give a new parent: ___',
  'An inappropriate gift for your boss: ___',
  'A terrible name for a guard dog: ___',
  "The secret ingredient in grandma's soup: ___",
  'A bad reason to call in sick to work: ___',
  'What aliens will judge humanity by: ___',
  'The most disappointing thing to find in a treasure chest: ___',
  "A spell they don't teach at wizard school: ___",
  'The worst theme for a wedding: ___',
  'A terrible catchphrase for a robot: ___',
  'What the pyramids were actually built for: ___',
  'A bad name for a perfume: ___',
  'The least reassuring thing a surgeon could say: ___',
  'An event that should NOT have a mascot: ___',
  'The worst thing to whisper to a sleeping cat: ___',
  'The worst thing to name your firstborn child: ___',
  'A rejected event for the Olympics: ___',
  'The real reason the elevator stopped: ___',
  'A terrible mascot for a hospital: ___',
  'The worst possible message in a fortune cookie: ___',
  'The most cursed item at a garage sale: ___',
  'A bad theme for a school dance: ___',
  'The worst thing to hear over an airport loudspeaker: ___',
]

const ROUNDS_PER_GAME = 3

/** Deliberately bland throwaway answers for a player who runs out of time, so the
 *  vote gallery has no gap and nobody is stuck at zero. The safety answer scores at
 *  half, so it never out-earns a real joke. Quiplash's "Safety Quip". */
const SAFETY_QUIPS: string[] = [
  'I plead the fifth',
  '(stunned silence)',
  'My mind went blank',
  'No comment',
  'Uhh... pass',
  'The dog ate my answer',
]

/** Build one quip+vote pair for a prompt. The vote round derives from the quip. */
function pair(prompt: string): RoundInstance[] {
  return [
    { block: 'quip', content: { prompt, placeholder: '', maxLength: 80, timer: 60, safetyAnswers: SAFETY_QUIPS } },
    // The vote round derives its options from the quip round (the previous round,
    // which is `from`'s default), so no `from` needed here.
    { block: 'vote', content: { prompt: 'Which answer wins?', options: [], mode: 'field', timer: 30 } },
  ]
}

function deckFrom(prompts: string[]): RoundInstance[] {
  return prompts.flatMap(pair)
}

/** The built-in pool as deck rows; a creator Prompt Deck overrides these. */
const DEFAULT_ROWS = PROMPT_POOL.map((prompt) => ({ prompt }))

export const quipClash = defineGame({
  manifest: {
    id: 'quip-clash',
    name: 'Quip Clash',
    version: '0.1.0',
    description: 'Answer a prompt, then vote for the funniest answer. The room writes the jokes.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [quipBlock, voteBlock],
  // A small fixed deck for the editor preview / fallback.
  defaultConfig: { title: 'Quip Clash', rounds: deckFrom(PROMPT_POOL.slice(0, ROUNDS_PER_GAME)) },
  // The pool is deck-feedable: a creator can attach a Prompt Deck to play their own
  // prompts instead of PROMPT_POOL (see docs/decks-roadmap.md).
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  // Each play: shuffle the rows (built-in pool, or a creator deck via opts.rows) by the
  // room code and take a fresh set. The host can pick how many to play (opts.rounds).
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Quip Clash', rounds: seededShuffle(`quip:${seed}`)(rows).slice(0, n).flatMap((r) => pair(String(r.prompt))) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Prompts' },
})
