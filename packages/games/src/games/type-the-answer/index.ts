/**
 * Type the Answer, free-text trivia. No multiple choice: every player TYPES the
 * answer on their phone, graded by the tolerant shared matcher (case/space/accent
 * fold, a leading article dropped, small typos forgiven, plus a synonym list). A
 * single-block composition over the `answer` block, drawing a fresh set of
 * questions from a large pool each play (`buildConfig`, seeded by the room code).
 *
 * Deck-feedable: attach a Quiz Deck (question + answer columns, synonyms delimited
 * by `|`) and the host plays your questions instead of the built-in pool. The
 * answer column is withheld from non-owners (`answerColumns`, invariant #3).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { answerBlock } from '../../blocks/answer/block'
import { answerRowFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

/** One pool row: a question + its accepted answers (synonyms delimited by `|`). */
interface Row {
  prompt: string
  answers: string
}

/** Built-in trivia. Answers list the canonical form first, then common synonyms
 *  (delimited by `|`). Fact-checked, no em dashes. A creator Quiz Deck overrides these. */
const POOL: Row[] = [
  { prompt: 'What is the capital of Japan?', answers: 'Tokyo' },
  { prompt: 'What planet is known as the Red Planet?', answers: 'Mars' },
  { prompt: 'How many continents are there on Earth?', answers: 'Seven|7' },
  { prompt: 'What gas do plants absorb from the air for photosynthesis?', answers: 'Carbon dioxide|CO2' },
  { prompt: 'Who painted the Mona Lisa?', answers: 'Leonardo da Vinci|da Vinci|Leonardo' },
  { prompt: 'What is the largest ocean on Earth?', answers: 'Pacific|Pacific Ocean' },
  { prompt: 'What is the chemical symbol for gold?', answers: 'Au' },
  { prompt: 'In what country would you find the Eiffel Tower?', answers: 'France' },
  { prompt: 'What is the tallest land animal?', answers: 'Giraffe' },
  { prompt: 'How many sides does a hexagon have?', answers: 'Six|6' },
  { prompt: 'What is the largest planet in our solar system?', answers: 'Jupiter' },
  { prompt: 'What language has the most native speakers worldwide?', answers: 'Mandarin|Mandarin Chinese|Chinese' },
  { prompt: 'What is the hardest known natural material?', answers: 'Diamond' },
  { prompt: 'Who wrote the play Romeo and Juliet?', answers: 'Shakespeare|William Shakespeare' },
  { prompt: 'What is the smallest prime number?', answers: 'Two|2' },
  { prompt: 'What is the freezing point of water in Celsius?', answers: 'Zero|0' },
  { prompt: 'Which ocean is the Bermuda Triangle in?', answers: 'Atlantic|Atlantic Ocean' },
  { prompt: 'What metal is liquid at room temperature?', answers: 'Mercury' },
  { prompt: 'What is the largest country by land area?', answers: 'Russia' },
  { prompt: 'How many strings does a standard guitar have?', answers: 'Six|6' },
  { prompt: 'What is the currency of Japan?', answers: 'Yen' },
  { prompt: 'What organ pumps blood around the body?', answers: 'Heart' },
  { prompt: 'What is the capital of Australia?', answers: 'Canberra' },
  { prompt: 'Which planet is closest to the Sun?', answers: 'Mercury' },
  { prompt: 'What is the longest river in the world?', answers: 'Nile|The Nile' },
  { prompt: 'How many minutes are in a full day?', answers: '1440' },
]

const ROUNDS_PER_GAME = 7

/** Split a delimited accepted-answers cell into a list (prefer `|`, then `;`, then `,`). */
function splitAnswers(raw: string): string[] {
  const sep = raw.includes('|') ? '|' : raw.includes(';') ? ';' : ','
  return raw
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean)
}

function roundsFrom(rows: Row[]): RoundInstance[] {
  return rows.map((r) => ({
    block: 'answer',
    content: { subject: '', prompt: r.prompt, image: '', answers: splitAnswers(r.answers), fuzzy: true, timer: 30 },
  }))
}

/** The built-in pool as deck rows; a creator Quiz Deck overrides these. */
const DEFAULT_ROWS = POOL.map((r) => ({ prompt: r.prompt, answers: r.answers }))

export const typeTheAnswer = defineGame({
  manifest: {
    id: 'type-the-answer',
    name: 'Type the Answer',
    version: '0.1.0',
    description: 'Free-text trivia: type the answer on your phone. Spelling and accents are forgiven.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 1,
    flagship: true,
  },
  blocks: [answerBlock],
  defaultConfig: { title: 'Type the Answer', rounds: roundsFrom(POOL.slice(0, ROUNDS_PER_GAME)) },
  contentPool: {
    defaultRows: DEFAULT_ROWS,
    deckKind: 'quiz',
    fromRow: answerRowFromRow,
    answerColumns: ['answers', 'answer'],
    requires: [['question', 'prompt'], ['answers', 'answer']],
  },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    const picked = seededShuffle(`type-the-answer:${seed}`)(rows)
      .slice(0, n)
      .map((r) => ({ prompt: String(r.prompt), answers: String(r.answers) }))
    return { title: 'Type the Answer', rounds: roundsFrom(picked) }
  },
  roundOptions: { min: 3, max: 15, default: ROUNDS_PER_GAME, label: 'Questions' },
})
