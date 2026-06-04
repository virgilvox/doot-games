/**
 * Ballpark, numeric "closest guess wins" trivia. Single-block composition over the
 * `ballpark` block: each round poses a number question (the answer withheld until
 * the needle reveal). Each play draws a fresh set from a pool (`buildConfig`,
 * seeded by the room code). Facts are deliberately the kind nobody knows exactly,
 * so guessing in the ballpark is the whole point.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { ballparkBlock } from '../../blocks/ballpark/block'
import { ballparkFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Fact {
  prompt: string
  answer: number
  unit?: string
  subject?: string
}

const FACT_POOL: Fact[] = [
  { prompt: 'How many bones are in the adult human body?', answer: 206 },
  { prompt: 'How many keys are on a standard piano?', answer: 88 },
  { prompt: 'How many ridges are on the edge of a US quarter?', answer: 119, unit: 'ridges' },
  { prompt: 'How far is the Moon from Earth, on average?', answer: 384400, unit: 'km' },
  { prompt: 'How many countries are there in the world (UN members)?', answer: 193 },
  { prompt: 'What year was the first iPhone released?', answer: 2007 },
  { prompt: 'How many hearts does an octopus have?', answer: 3 },
  { prompt: 'How tall is the Eiffel Tower (to the tip)?', answer: 330, unit: 'm' },
  { prompt: 'How many time zones does Russia span?', answer: 11 },
  { prompt: 'How many minutes does sunlight take to reach Earth?', answer: 8, unit: 'min' },
  { prompt: 'How many elements are on the periodic table?', answer: 118 },
  { prompt: 'What is the boiling point of water in Fahrenheit?', answer: 212, unit: '°F' },
  { prompt: 'How many strings does a standard guitar have?', answer: 6 },
  { prompt: 'How many days did it take Magellan’s crew to circle the globe?', answer: 1082, unit: 'days' },
  { prompt: 'How many official languages does Switzerland have?', answer: 4 },
  { prompt: 'How fast can a cheetah run at top speed?', answer: 112, unit: 'km/h' },
  { prompt: 'How many moons does Jupiter have (confirmed)?', answer: 95 },
  { prompt: 'How many floors does the Empire State Building have?', answer: 102 },
]

const ROUNDS_PER_GAME = 6

function deckFrom(facts: Fact[]): RoundInstance[] {
  return facts.map((f) => ({
    block: 'ballpark',
    content: {
      subject: f.subject ?? '',
      prompt: f.prompt,
      image: '',
      unit: f.unit ?? '',
      answer: f.answer,
      timer: 30,
    },
  }))
}

/** The built-in pool as flat deck rows; a creator Quiz Deck (prompt + answer (+ unit)
 *  columns) overrides these. */
const DEFAULT_ROWS = FACT_POOL.map((f) => ({ prompt: f.prompt, answer: f.answer, unit: f.unit ?? '', subject: f.subject ?? '' }))
const rowToFact = (r: Record<string, string | number>): Fact => ({
  prompt: String(r.prompt),
  answer: Number(r.answer),
  unit: r.unit ? String(r.unit) : undefined,
  subject: r.subject ? String(r.subject) : undefined,
})

export const ballpark = defineGame({
  manifest: {
    id: 'ballpark',
    name: 'Ballpark',
    version: '0.1.0',
    description: 'Numeric trivia where the closest guess wins. Get in the ballpark; no need to be exact.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 1,
    flagship: true,
  },
  blocks: [ballparkBlock],
  defaultConfig: { title: 'Ballpark', rounds: deckFrom(FACT_POOL.slice(0, ROUNDS_PER_GAME)) },
  // Deck-feedable: a creator can attach a Quiz Deck (prompt + answer (+ unit) columns)
  // to play their own number questions. The `answer` column is withheld from non-owners.
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'quiz', fromRow: ballparkFromRow, answerColumns: ['answer', 'value'] },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Ballpark', rounds: deckFrom(seededShuffle(`ballpark:${seed}`)(rows).slice(0, n).map(rowToFact)) }
  },
  roundOptions: { min: 3, max: 12, default: ROUNDS_PER_GAME, label: 'Questions' },
})
