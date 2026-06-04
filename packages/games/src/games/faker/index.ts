/**
 * Faker, a hidden-imposter social-deduction "Game From Doot" and the first game
 * built on the SECRET per-player content primitive. Everyone is shown a category
 * and a secret word except one player (the faker), who knows only the category.
 * Each player gives a one-word clue; then the room reads the clues, debates, and
 * votes for who they think was bluffing.
 *
 * It is a composition of `[faker, accuse]` pairs (one per word): the make round
 * (`faker`) assigns the secret roles and collects clues; the judge round (`accuse`)
 * is derived from it at runtime, attributing each clue to its author and learning
 * who the faker is from the make round's withheld answer key. A fresh set of words
 * is drawn from a large pool each play (`buildConfig`, seeded by the room) so no two
 * rooms get the same words.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { accuseBlock } from '../../blocks/accuse/block'
import { fakerBlock } from '../../blocks/faker/block'
import { secretFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

/** Brand-free, family-safe category/word pairs. The category is public; the word is
 *  the secret every non-faker is told privately. */
interface Secret {
  category: string
  word: string
}
const WORD_POOL: Secret[] = [
  { category: 'Animals', word: 'Elephant' },
  { category: 'Fruit', word: 'Pineapple' },
  { category: 'Vehicles', word: 'Submarine' },
  { category: 'Sports', word: 'Bowling' },
  { category: 'Places', word: 'Library' },
  { category: 'Jobs', word: 'Firefighter' },
  { category: 'Breakfast', word: 'Pancakes' },
  { category: 'Weather', word: 'Thunderstorm' },
  { category: 'Instruments', word: 'Trumpet' },
  { category: 'Holidays', word: 'Halloween' },
  { category: 'In the kitchen', word: 'Toaster' },
  { category: 'Board games', word: 'Checkers' },
  { category: 'Insects', word: 'Butterfly' },
  { category: 'At the beach', word: 'Sandcastle' },
  { category: 'Movies', word: 'Popcorn' },
  { category: 'Space', word: 'Asteroid' },
  { category: 'Clothing', word: 'Raincoat' },
  { category: 'Drinks', word: 'Lemonade' },
  { category: 'Tools', word: 'Hammer' },
  { category: 'Birds', word: 'Penguin' },
  { category: 'Desserts', word: 'Cheesecake' },
  { category: 'In the city', word: 'Subway' },
  { category: 'Camping', word: 'Campfire' },
  { category: 'Vegetables', word: 'Broccoli' },
]

const ROUNDS_PER_GAME = 3

/** One make+accuse pair for a secret. The accuse round derives from the faker round
 *  (its default source is the immediately prior round). */
function pair(secret: Secret): RoundInstance[] {
  return [
    {
      block: 'faker',
      content: {
        category: secret.category,
        word: secret.word,
        prompt: 'Give a one-word clue that proves you know the word, without giving it away.',
        timer: 45,
      },
    },
    { block: 'accuse', content: { prompt: 'Who is the faker?', category: '', clues: [], timer: 45 } },
  ]
}

function deckFrom(secrets: Secret[]): RoundInstance[] {
  return secrets.flatMap(pair)
}

/** The built-in pool as flat deck rows; a creator deck (category + word columns)
 *  overrides these. */
const DEFAULT_ROWS = WORD_POOL.map((s) => ({ category: s.category, word: s.word }))
const rowToSecret = (r: Record<string, string | number>): Secret => ({ category: String(r.category), word: String(r.word) })

export const faker = defineGame({
  manifest: {
    id: 'faker',
    name: 'Faker',
    version: '0.1.0',
    description: 'Everyone gets a secret word except one faker. Give a clue, then sniff out who is bluffing.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [fakerBlock, accuseBlock],
  defaultConfig: { title: 'Faker', rounds: deckFrom(WORD_POOL.slice(0, ROUNDS_PER_GAME)) },
  // Deck-feedable: a creator can attach a deck (category + word columns) to play their
  // own secret words. The `word` column is the secret, withheld from non-owners.
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'card', fromRow: secretFromRow, answerColumns: ['word', 'secret'] },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Faker', rounds: deckFrom(seededShuffle(`faker:${seed}`)(rows).slice(0, n).map(rowToSecret)) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Rounds' },
})
