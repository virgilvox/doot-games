/**
 * Wager, high-stakes trivia. Each round is a multiple-choice question; before you
 * answer you bet a tier of points (100 / 300 / 500) on it. Right adds your bet,
 * wrong subtracts it. Everyone starts at a base bankroll and the richest wins. A
 * single-block composition over the `wager` block, drawing a fresh set of questions
 * each play (seeded by the room).
 *
 * Deck-feedable: attach a quiz deck (question + options + the correct answer) and
 * the host plays your questions. The correct option is withheld from non-owners.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { wagerBlock } from '../../blocks/wager/block'
import { choiceFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Q {
  prompt: string
  options: string[]
  /** 0-based index of the correct option. */
  correct: number
}

/** Built-in questions (fact-checked; the correct index is 0-based). A creator deck overrides these. */
const QUESTION_POOL: Q[] = [
  { prompt: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correct: 2 },
  { prompt: 'Which planet is the largest in our solar system?', options: ['Earth', 'Jupiter', 'Saturn', 'Mars'], correct: 1 },
  { prompt: 'How many bones are in the adult human body?', options: ['196', '206', '216', '226'], correct: 1 },
  { prompt: 'What gas do plants absorb from the air?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], correct: 1 },
  { prompt: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
  { prompt: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'], correct: 1 },
  { prompt: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correct: 2 },
  { prompt: 'What is the tallest land animal?', options: ['Elephant', 'Giraffe', 'Horse', 'Camel'], correct: 1 },
  { prompt: 'How many continents are there on Earth?', options: ['Five', 'Six', 'Seven', 'Eight'], correct: 2 },
  { prompt: 'What is the hardest known natural material?', options: ['Quartz', 'Diamond', 'Granite', 'Steel'], correct: 1 },
  { prompt: 'What is the smallest prime number?', options: ['0', '1', '2', '3'], correct: 2 },
  { prompt: 'Which of these is a noble gas?', options: ['Oxygen', 'Nitrogen', 'Neon', 'Hydrogen'], correct: 2 },
  { prompt: 'What is the capital of Japan?', options: ['Osaka', 'Kyoto', 'Tokyo', 'Nagoya'], correct: 2 },
  { prompt: 'The speed of light is about how fast?', options: ['3,000 km/s', '30,000 km/s', '300,000 km/s', '3 million km/s'], correct: 2 },
  { prompt: 'What is the largest country by land area?', options: ['Canada', 'China', 'United States', 'Russia'], correct: 3 },
  { prompt: 'How many strings does a standard guitar have?', options: ['Four', 'Five', 'Six', 'Seven'], correct: 2 },
]

const ROUNDS_PER_GAME = 8

function rowsToRounds(rows: Array<Record<string, string | number>>): RoundInstance[] {
  return rows.map((r) => ({
    block: 'wager',
    content: {
      subject: '',
      prompt: String(r.prompt),
      image: '',
      timer: 25,
      options: String(r.options)
        .split('|')
        .map((l) => ({ label: l.trim() }))
        .filter((o) => o.label),
      correct: Number(r.correct),
    },
  }))
}

/** The built-in pool as deck rows; a creator quiz deck overrides these. */
const DEFAULT_ROWS = QUESTION_POOL.map((q) => ({ prompt: q.prompt, options: q.options.join('|'), correct: q.correct }))

export const wager = defineGame({
  manifest: {
    id: 'wager',
    name: 'Wager',
    version: '0.1.0',
    description: 'High-stakes trivia: bet on your answer. Right adds your bet, wrong takes it. Richest wins.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 1,
    flagship: true,
  },
  blocks: [wagerBlock],
  defaultConfig: { title: 'Wager', rounds: rowsToRounds(DEFAULT_ROWS.slice(0, 5)) },
  contentPool: {
    defaultRows: DEFAULT_ROWS,
    deckKind: 'quiz',
    fromRow: choiceFromRow,
    answerColumns: ['correct', 'answer'],
    requires: [['prompt', 'question', 'q'], ['options', 'choices', 'option1', 'a']],
  },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: 'Wager', rounds: rowsToRounds(seededShuffle(`wager:${seed}`)(rows).slice(0, n)) }
  },
  roundOptions: { min: 3, max: 15, default: ROUNDS_PER_GAME, label: 'Questions' },
})
