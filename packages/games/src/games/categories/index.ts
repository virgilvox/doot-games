/**
 * Categories (Scattergories). Each round draws a random letter and a handful of
 * categories; everyone races to fill in an answer for each, all starting with the
 * letter. You score for answers that are valid AND unique, so the trick is to think
 * of something nobody else will. A single-block composition over the `categories`
 * block, drawing a fresh letter + category set each round (seeded by the room).
 *
 * Deck-feedable: attach a prompt deck of categories (one per row) and the host
 * plays your list instead of the built-in pool.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { categoriesBlock } from '../../blocks/categories/block'
import { promptFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

// Skip the brutal letters (Q, U, V, X, Y, Z) so every round is playable.
const LETTERS = 'BCDFGHJLMNPRSTW'.split('')
const CATS_PER_ROUND = 5
const ROUNDS_PER_GAME = 4

/** Built-in categories (broadly answerable, party-safe). A creator deck overrides these. */
const POOL: string[] = [
  'An animal',
  'A food',
  'A city',
  'A movie',
  'A color',
  'A country',
  'A sport',
  'A job',
  'A fruit',
  'A vegetable',
  'Something cold',
  'Something in the kitchen',
  'A musical instrument',
  'A TV show',
  'A board game',
  'A drink',
  'A piece of clothing',
  'A body part',
  'A school subject',
  'A famous person',
  'Something at the beach',
  'A type of weather',
  'A book',
  'An animal at the zoo',
  'Something round',
  'A holiday',
  'A hobby',
  'A reason to be late',
]

/** Build N rounds: each a distinct letter + a distinct slice of categories. */
function buildRounds(catLabels: string[], letters: string[], n: number): RoundInstance[] {
  const rounds: RoundInstance[] = []
  for (let r = 0; r < n; r++) {
    const letter = letters[r % letters.length] ?? 'C'
    const start = (r * CATS_PER_ROUND) % Math.max(1, catLabels.length)
    // Take a distinct slice, cycling around the (deduped) pool so small decks still work.
    const cats: string[] = []
    for (let i = 0; i < CATS_PER_ROUND && cats.length < catLabels.length; i++) {
      const label = catLabels[(start + i) % catLabels.length]
      if (label && !cats.includes(label)) cats.push(label)
    }
    rounds.push({
      block: 'categories',
      content: {
        prompt: 'Categories',
        letter,
        categories: cats.map((label, i) => ({ id: `c${i}`, label })),
        timer: 120,
      },
    })
  }
  return rounds
}

function configFrom(rows: Array<Record<string, string | number>>, seed: string, n: number) {
  const labels = [...new Set(seededShuffle(`categories:${seed}`)(rows).map((r) => String(r.prompt)).filter(Boolean))]
  const letters = seededShuffle(`categories-letters:${seed}`)(LETTERS)
  // A round can reuse a category with a new letter, so the round count isn't bound
  // by the pool size; just clamp to a sane floor.
  return { title: 'Categories', rounds: buildRounds(labels, letters, Math.max(1, n)) }
}

/** The built-in pool as deck rows; a creator prompt deck overrides these. */
const DEFAULT_ROWS = POOL.map((prompt) => ({ prompt }))

export const categories = defineGame({
  manifest: {
    id: 'categories',
    name: 'Categories',
    version: '0.1.0',
    description: 'Scattergories: a letter, a few categories, race to fill them in. Unique answers score.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [categoriesBlock],
  defaultConfig: configFrom(DEFAULT_ROWS, 'preview', 2),
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'prompt', fromRow: promptFromRow },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    return configFrom(rows, seed, opts?.rounds ?? ROUNDS_PER_GAME)
  },
  roundOptions: { min: 2, max: 8, default: ROUNDS_PER_GAME, label: 'Rounds' },
})
