/**
 * Over/Under, fast estimation trivia. Each round names a quantity and a line; the
 * room guesses whether the real figure is OVER or UNDER it. A scored game (correct
 * guesses climb the leaderboard), so it shows the running standings between rounds
 * and works in teams. A single-block composition over the `guess` block with two
 * fixed options, drawing a fresh set of questions each play.
 *
 * Deck-feedable: attach a deck with a `prompt` + a `correct` side (over/under) or a
 * `threshold` + `actual` number to derive it. The correct side is withheld from
 * non-owners (the guess block's redaction), so a saved game never leaks answers.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { guessBlock } from '../../blocks/guess/block'
import { overUnderFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Row {
  prompt: string
  /** 0 = Over, 1 = Under. */
  correct: number
}

/** Built-in questions. Each `correct` is fact-checked against the real figure
 *  (noted in the comment). 0 = Over, 1 = Under. A creator deck overrides these. */
const POOL: Row[] = [
  { prompt: 'Mount Everest: over or under 8,000 m tall?', correct: 0 }, // 8,849 m
  { prompt: 'The human body: over or under 200 bones?', correct: 0 }, // 206
  { prompt: 'A chess board: over or under 100 squares?', correct: 1 }, // 64
  { prompt: 'The Moon: over or under 500,000 km from Earth?', correct: 1 }, // ~384,400
  { prompt: 'A year on Mars: over or under 500 Earth days?', correct: 0 }, // 687
  { prompt: 'An octopus: over or under 5 hearts?', correct: 1 }, // 3
  { prompt: 'The Great Wall of China: over or under 10,000 km long?', correct: 0 }, // ~21,000
  { prompt: 'A grand piano: over or under 100 keys?', correct: 1 }, // 88
  { prompt: 'The speed of sound: over or under 1,000 km/h?', correct: 0 }, // ~1,235
  { prompt: 'The Eiffel Tower: over or under 300 m tall?', correct: 0 }, // 330
  { prompt: 'The human body: over or under 50% water?', correct: 0 }, // ~60%
  { prompt: 'The Pacific Ocean: over or under 10,000 m at its deepest?', correct: 0 }, // ~10,935
  { prompt: 'The Sahara Desert: over or under 5 million sq km?', correct: 0 }, // ~9.2M
  { prompt: 'Mount Kilimanjaro: over or under 6,000 m tall?', correct: 1 }, // 5,895
  { prompt: 'The Titanic: over or under 800 feet long?', correct: 0 }, // 882
  { prompt: 'The human brain: over or under 50 billion neurons?', correct: 0 }, // ~86B
  { prompt: 'A marathon: over or under 25 miles?', correct: 0 }, // 26.2
  { prompt: 'The Nile River: over or under 5,000 km long?', correct: 0 }, // ~6,650
  { prompt: 'A deck of playing cards: over or under 50 cards?', correct: 0 }, // 52
  { prompt: 'An adult cat: over or under 20 hours of sleep a day?', correct: 1 }, // ~14
  { prompt: 'The Burj Khalifa: over or under 800 m tall?', correct: 0 }, // 828
  { prompt: 'Saturn: over or under 30 moons?', correct: 0 }, // 140+
]

const ROUNDS_PER_GAME = 8

function roundsFrom(rows: Row[]): RoundInstance[] {
  return rows.map((r) => ({
    block: 'guess',
    content: {
      subject: 'Over or Under',
      prompt: r.prompt,
      image: '',
      timer: 20,
      hideUntilReveal: true,
      options: [{ label: 'Over' }, { label: 'Under' }],
      correct: r.correct,
    },
  }))
}

/** The built-in pool as deck rows; a creator deck overrides these. */
const DEFAULT_ROWS = POOL.map((r) => ({ prompt: r.prompt, correct: r.correct }))

export const overUnder = defineGame({
  manifest: {
    id: 'over-under',
    name: 'Over / Under',
    version: '0.1.0',
    description: 'Estimation trivia: is the real figure over or under the line? Closest call climbs the board.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 1,
    flagship: true,
  },
  blocks: [guessBlock],
  defaultConfig: { title: 'Over / Under', rounds: roundsFrom(POOL.slice(0, 5)) },
  contentPool: {
    defaultRows: DEFAULT_ROWS,
    deckKind: 'quiz',
    fromRow: overUnderFromRow,
    answerColumns: ['correct', 'answer'],
    requires: [['prompt', 'question'], ['correct', 'answer', 'side']],
  },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    const picked = seededShuffle(`over-under:${seed}`)(rows)
      .slice(0, n)
      .map((r) => ({ prompt: String(r.prompt), correct: Number(r.correct) }))
    return { title: 'Over / Under', rounds: roundsFrom(picked) }
  },
  roundOptions: { min: 3, max: 15, default: ROUNDS_PER_GAME, label: 'Questions' },
})
