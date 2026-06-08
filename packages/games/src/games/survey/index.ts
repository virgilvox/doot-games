/**
 * Survey (Family Feud, authored). Each round shows a question with a hidden board
 * of the top answers; players name as many as they can, and each board answer they
 * find scores its points. A single-block composition over the `survey` block,
 * drawing a fresh set of questions each play (seeded by the room).
 *
 * Deck-feedable: attach a quiz deck where each row is a question + an `answers`
 * column listing the board ("Pepperoni:35 | Cheese:25 | ...", points optional). The
 * board is withheld from non-owners (the survey block's redaction).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { surveyBlock } from '../../blocks/survey/block'
import { parseBoard } from '../../blocks/survey/logic'
import { surveyFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Row {
  prompt: string
  answers: string
}

/** Built-in surveys (broadly answerable, party-safe, no brand names). Each board is
 *  "Answer:points" ranked highest first. A creator deck overrides these. */
const POOL: Row[] = [
  { prompt: 'Name a popular pizza topping.', answers: 'Pepperoni:35|Cheese:25|Mushroom:15|Sausage:12|Onion:8|Pineapple:5' },
  { prompt: 'Name something you do before bed.', answers: 'Brush teeth:30|Read:20|Shower:15|Check your phone:15|Set an alarm:12|Snack:8' },
  { prompt: 'Name a reason you might be late.', answers: 'Traffic:35|Overslept:25|Bad weather:15|Lost your keys:12|The kids:8|Stopped for coffee:5' },
  { prompt: 'Name a fruit.', answers: 'Apple:30|Banana:25|Orange:18|Grape:12|Strawberry:10|Mango:5' },
  { prompt: 'Name something you find in a kitchen.', answers: 'Fridge:25|Stove:20|Sink:18|Microwave:15|Oven:12|Toaster:10' },
  { prompt: 'Name a popular pet.', answers: 'Dog:40|Cat:30|Fish:12|Hamster:8|Bird:6|Rabbit:4' },
  { prompt: 'Name a type of weather.', answers: 'Rain:30|Sun:25|Snow:20|Wind:12|Clouds:8|Storm:5' },
  { prompt: 'Name something you take to the beach.', answers: 'Towel:25|Sunscreen:22|Umbrella:18|Snacks:12|A book:12|Sunglasses:11' },
  { prompt: 'Name a breakfast food.', answers: 'Eggs:30|Cereal:22|Toast:18|Pancakes:15|Bacon:10|Fruit:5' },
  { prompt: 'Name a color.', answers: 'Blue:30|Red:25|Green:18|Yellow:12|Purple:8|Orange:7' },
  { prompt: 'Name something you bring on vacation.', answers: 'Clothes:25|Your phone:20|A passport:18|A camera:15|Sunscreen:12|Snacks:10' },
  { prompt: 'Name a way to cook an egg.', answers: 'Scrambled:30|Fried:25|Boiled:20|Poached:15|Omelette:10' },
]

const ROUNDS_PER_GAME = 5

function roundsFrom(rows: Row[]): RoundInstance[] {
  return rows.map((r) => ({
    block: 'survey',
    content: { prompt: r.prompt, answers: parseBoard(r.answers), guessCount: 3, timer: 45 },
  }))
}

/** The built-in pool as deck rows; a creator quiz deck overrides these. */
const DEFAULT_ROWS = POOL.map((r) => ({ prompt: r.prompt, answers: r.answers }))

export const survey = defineGame({
  manifest: {
    id: 'survey',
    name: 'Survey',
    version: '0.1.0',
    description: 'Family-feud style: we surveyed the board; name the top answers to score.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 1,
    flagship: true,
  },
  blocks: [surveyBlock],
  defaultConfig: { title: 'Survey', rounds: roundsFrom(POOL.slice(0, 3)) },
  contentPool: {
    defaultRows: DEFAULT_ROWS,
    deckKind: 'quiz',
    fromRow: surveyFromRow,
    answerColumns: ['answers', 'board'],
    requires: [['prompt', 'question'], ['answers', 'board']],
  },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    const picked = seededShuffle(`survey:${seed}`)(rows)
      .slice(0, n)
      .map((r) => ({ prompt: String(r.prompt), answers: String(r.answers) }))
    return { title: 'Survey', rounds: roundsFrom(picked) }
  },
  roundOptions: { min: 3, max: 12, default: ROUNDS_PER_GAME, label: 'Surveys' },
})
