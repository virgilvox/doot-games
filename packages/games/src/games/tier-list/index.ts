/**
 * Tier List, the "build the S-to-D board" party game. The room is shown a set of
 * subjects and everyone places each one into a tier on their phone; the big screen
 * shows the room's consensus board forming live. A single-round composition over the
 * `tier` block, drawing a fresh set of subjects each play.
 *
 * Deck-feedable: attach a prompt deck of subjects (one per row) and the host tiers
 * your list instead of the built-in pool.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { tierBlock } from '../../blocks/tier/block'
import { DEFAULT_TIERS } from '../../blocks/tier/logic'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

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

const ITEMS_PER_GAME = 12

/** Stable id per subject (placements key by id), de-duplicated. */
function itemsFor(subjects: string[]): Array<{ id: string; label: string; image: string }> {
  const taken = new Set<string>()
  return subjects.map((label) => {
    const base =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'item'
    let id = base
    let n = 2
    while (taken.has(id)) id = `${base}-${n++}`
    taken.add(id)
    return { id, label, image: '' }
  })
}

function boardRound(subjects: string[]): RoundInstance {
  return {
    block: 'tier',
    content: {
      prompt: 'Where does each one land?',
      image: '',
      timer: null,
      tiers: DEFAULT_TIERS.map((t) => ({ ...t })),
      items: itemsFor(subjects),
      scored: false,
      liveConsensus: true,
    },
  }
}

/** The built-in pool as deck rows; a creator prompt deck overrides these. */
const DEFAULT_ROWS = POOL.map((prompt) => ({ prompt }))

export const tierList = defineGame({
  manifest: {
    id: 'tier-list',
    name: 'Tier List',
    version: '0.1.0',
    description: 'Build the S-to-D board together. The room decides where each one lands.',
    author: 'Doot',
    capabilities: [],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [tierBlock],
  defaultConfig: { title: 'Tier List', rounds: [boardRound(POOL.slice(0, ITEMS_PER_GAME))] },
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(2, Math.min(opts?.rounds ?? ITEMS_PER_GAME, rows.length))
    const subjects = seededShuffle(`tier-list:${seed}`)(rows)
      .slice(0, n)
      .map((r) => String(r.prompt))
    return { title: 'Tier List', rounds: [boardRound(subjects)] }
  },
  // The roundOptions slider now sets how many ITEMS land on the one board.
  roundOptions: { min: 6, max: 24, default: ITEMS_PER_GAME, label: 'Items' },
})
