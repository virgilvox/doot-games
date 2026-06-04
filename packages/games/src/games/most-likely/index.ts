/**
 * Most Likely To, the roster game: each round the room votes a PLAYER from the
 * lobby for a "most likely to..." prompt, and the reveal shows the room's pick.
 * Single-block composition over the `mostlikely` block; each play draws a fresh
 * set of prompts from a pool (`buildConfig`, seeded by the room code).
 *
 * The prompts ship deliberately mild (party-safe). The host sets the tone.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { mostLikelyBlock } from '../../blocks/mostlikely/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

const PROMPT_POOL: string[] = [
  'Most likely to become famous.',
  'Most likely to survive a zombie apocalypse.',
  'Most likely to forget where they parked.',
  'Most likely to start a podcast.',
  'Most likely to win a reality show.',
  'Most likely to bring snacks for everyone.',
  'Most likely to get lost on the way home.',
  'Most likely to adopt ten pets.',
  'Most likely to become a millionaire.',
  'Most likely to laugh at the wrong moment.',
  'Most likely to talk their way out of a ticket.',
  'Most likely to fall asleep at the party.',
  'Most likely to run for office.',
  'Most likely to have a secret talent.',
  'Most likely to text back three days later.',
  'Most likely to plan the whole trip.',
  'Most likely to befriend a stranger in five minutes.',
  'Most likely to know a random fact about anything.',
  'Most likely to survive being stranded on a desert island.',
  'Most likely to accidentally become a meme.',
  'Most likely to win a dance-off.',
  'Most likely to forget their own birthday.',
  'Most likely to give a TED talk one day.',
  'Most likely to cry happy tears at a wedding.',
  'Most likely to get a tattoo on a dare.',
  'Most likely to give their car a name.',
]

const ROUNDS_PER_GAME = 5

function deckFrom(prompts: string[]): RoundInstance[] {
  return prompts.map((prompt) => ({ block: 'mostlikely', content: { prompt, timer: 20 } }))
}

/** The built-in pool as deck rows; a creator Prompt Deck overrides these. */
const DEFAULT_ROWS = PROMPT_POOL.map((prompt) => ({ prompt }))

export const mostLikely = defineGame({
  manifest: {
    id: 'most-likely',
    name: 'Most Likely To',
    version: '0.1.0',
    description: "Vote a player for each 'most likely to...' prompt; the room's pick is revealed.",
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [mostLikelyBlock],
  defaultConfig: { title: 'Most Likely To', rounds: deckFrom(PROMPT_POOL.slice(0, ROUNDS_PER_GAME)) },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Most Likely To', rounds: deckFrom(seededShuffle(`mostlikely:${seed}`)(rows).slice(0, n).map((r) => String(r.prompt))) }
  },
  roundOptions: { min: 3, max: 12, default: ROUNDS_PER_GAME, label: 'Prompts' },
})
