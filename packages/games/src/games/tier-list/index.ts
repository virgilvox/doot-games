/**
 * Tier List, the "rank it S to D" party game. Each round shows one subject; the
 * room places it on a tier scale (S / A / B / C / D) and the results show the
 * room's consensus tier for each. A single-block composition over the `rate` block
 * with a labelled tier scale, drawing a fresh set of subjects each play.
 *
 * Deck-feedable: attach a prompt deck of subjects (one per row) and the host tiers
 * your list instead of the built-in pool.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { rateBlock } from '../../blocks/rate/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

/** S A B C D, ascending value so S is the top tier and the average lands on a tier. */
const TIER_SCALE = {
  kind: 'levels' as const,
  levels: [
    { label: 'D', value: 1 },
    { label: 'C', value: 2 },
    { label: 'B', value: 3 },
    { label: 'A', value: 4 },
    { label: 'S', value: 5 },
  ],
}

/** Built-in subjects to tier (broadly known, party-safe). A creator deck overrides these. */
const POOL: string[] = [
  'Pizza',
  'Mondays',
  'Pineapple on pizza',
  'Group chats',
  'Karaoke',
  'Cold showers',
  'Naps',
  'Public speaking',
  'Spreadsheets',
  'Surprise parties',
  'Long road trips',
  'Spicy food',
  'Board game night',
  'Daylight saving time',
  'Voice messages',
  'Hugs from strangers',
  'Camping',
  'Dad jokes',
  'New Year resolutions',
  'Reality TV',
  'Early morning workouts',
  'All-you-can-eat buffets',
]

const ROUNDS_PER_GAME = 6

function roundsFrom(subjects: string[]): RoundInstance[] {
  return subjects.map((subject) => ({
    block: 'rate',
    content: {
      subject,
      prompt: 'What tier?',
      image: '',
      timer: 20,
      categories: [{ id: 'tier', label: 'Tier' }],
      scale: TIER_SCALE,
    },
  }))
}

/** The built-in pool as deck rows; a creator prompt deck overrides these. */
const DEFAULT_ROWS = POOL.map((prompt) => ({ prompt }))

export const tierList = defineGame({
  manifest: {
    id: 'tier-list',
    name: 'Tier List',
    version: '0.1.0',
    description: 'Rank anything from S to D. The room decides where each one lands.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [rateBlock],
  defaultConfig: { title: 'Tier List', rounds: roundsFrom(POOL.slice(0, 5)) },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    const subjects = seededShuffle(`tier-list:${seed}`)(rows)
      .slice(0, n)
      .map((r) => String(r.prompt))
    return { title: 'Tier List', rounds: roundsFrom(subjects) }
  },
  roundOptions: { min: 3, max: 15, default: ROUNDS_PER_GAME, label: 'Subjects' },
})
