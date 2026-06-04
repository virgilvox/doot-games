/**
 * "What, You Didn't Know That?" - a trivia gameshow, the fifth flagship. The big
 * screen is the stage; everyone in the room plays along on their phones (so it
 * works at a convention panel AND at home). Obscure pop-culture multiple choice,
 * with the point value rising each question. The answer is withheld until the
 * dramatic reveal, and the fastest correct answerer "buzzes in" - their phone
 * dings and the stage spotlights them.
 *
 * Pure composition of `buzzer` rounds; a fresh, shuffled set is drawn from a pool
 * each play (buildConfig), with escalating point values assigned by position.
 *
 * NEXT (docs/flagship-games.md): the host-judged 4-contestant panel where an
 * audience member who buzzes in correctly steals the lowest contestant's seat,
 * the quick-draw tiebreaker, the final lightning round, and the specialty rounds
 * (theme songs, poorly described plots, Six Degrees, etc.).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { buzzerBlock } from '../../blocks/buzzer/block'
import { choiceFromRow } from '../../runtime/decks'
import { seededShuffle } from '../../runtime/derive'

interface Question {
  prompt: string
  options: string[]
  /** Index of the correct option. */
  correct: number
}

const QUESTION_POOL: Question[] = [
  { prompt: 'Who was the original voice of Mickey Mouse?', options: ['Mel Blanc', 'Walt Disney', 'Jim Cummings', 'Mickey Rooney'], correct: 1 },
  { prompt: 'What is the name of the coffee shop in Friends?', options: ['The Grind', "Monk's", 'Central Perk', 'Cafe Nervosa'], correct: 2 },
  { prompt: "What color was Luke Skywalker's lightsaber in the original Star Wars?", options: ['Green', 'Blue', 'Purple', 'Red'], correct: 1 },
  { prompt: "Which video game hero was originally called 'Jumpman'?", options: ['Sonic', 'Link', 'Mario', 'Donkey Kong'], correct: 2 },
  { prompt: 'What breed of dog is Scooby-Doo?', options: ['Boxer', 'Great Dane', 'Mastiff', 'Labrador'], correct: 1 },
  { prompt: "Which band released 'The Dark Side of the Moon'?", options: ['Led Zeppelin', 'Genesis', 'Pink Floyd', 'The Who'], correct: 2 },
  { prompt: 'What was the highest-grossing film of the 1990s worldwide?', options: ['Jurassic Park', 'Titanic', 'The Lion King', 'Independence Day'], correct: 1 },
  { prompt: 'In Toy Story, what kind of toy is Woody?', options: ['Wind-up robot', 'Action figure', 'Pull-string cowboy', 'Teddy bear'], correct: 2 },
  { prompt: "What is the fictional metal of Black Panther's Wakanda?", options: ['Adamantium', 'Vibranium', 'Mithril', 'Unobtainium'], correct: 1 },
  { prompt: 'Which 1982 sci-fi film features a character named Roy Batty?', options: ['Tron', 'Blade Runner', 'The Thing', 'E.T.'], correct: 1 },
  { prompt: 'What was the first music video ever played on MTV?', options: ['Thriller', 'Take On Me', 'Video Killed the Radio Star', 'Money for Nothing'], correct: 2 },
  { prompt: 'Which was the first full-length cel-animated feature film?', options: ['Snow White and the Seven Dwarfs', 'Steamboat Willie', 'Fantasia', 'Pinocchio'], correct: 0 },
  { prompt: 'What is the name of the kingdom in Disney\'s Frozen?', options: ['Corona', 'Arendelle', 'Far Far Away', 'DunBroch'], correct: 1 },
  { prompt: "In The Matrix, which pill does Neo take?", options: ['Blue', 'Green', 'Red', 'Yellow'], correct: 2 },
  { prompt: 'Who voiced the Genie in Disney\'s Aladdin (1992)?', options: ['Eddie Murphy', 'Robin Williams', 'Steve Martin', 'Billy Crystal'], correct: 1 },
  { prompt: 'In which country would you find the Great Pyramid of Giza?', options: ['Mexico', 'Egypt', 'Greece', 'Iraq'], correct: 1 },
  { prompt: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correct: 2 },
  { prompt: 'Who painted the Mona Lisa?', options: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Michelangelo'], correct: 2 },
  { prompt: 'What is the chemical formula for water?', options: ['CO2', 'H2O', 'O2', 'NaCl'], correct: 1 },
  { prompt: 'Which planet is closest to the Sun?', options: ['Venus', 'Earth', 'Mercury', 'Mars'], correct: 2 },
  { prompt: 'How many continents are there on Earth?', options: ['Five', 'Six', 'Seven', 'Eight'], correct: 2 },
  { prompt: 'What is the tallest mountain above sea level on Earth?', options: ['K2', 'Mount Everest', 'Kilimanjaro', 'Denali'], correct: 1 },
  { prompt: 'Which animal is traditionally called the King of the Jungle?', options: ['Tiger', 'Lion', 'Elephant', 'Gorilla'], correct: 1 },
]

const ROUNDS_PER_GAME = 6
const SUBJECT = "What, You Didn't Know That?"

/** Build one buzzer round, worth `points` (rises with each question). */
function toRound(q: Question, points: number): RoundInstance {
  return {
    block: 'buzzer',
    content: {
      subject: SUBJECT,
      prompt: q.prompt,
      image: '',
      timer: 20,
      options: q.options.map((label) => ({ label })),
      correct: q.correct,
      points,
    },
  }
}

/** Assign escalating values: question 1 = 100, question 2 = 200, ... */
function deckFrom(questions: Question[]): RoundInstance[] {
  return questions.map((q, i) => toRound(q, (i + 1) * 100))
}

/** The built-in pool as flat deck rows (options pipe-joined; `correct` is the 0-based
 *  index). A creator Quiz Deck (question + options + correct columns) overrides these. */
const DEFAULT_ROWS = QUESTION_POOL.map((q) => ({ prompt: q.prompt, options: q.options.join('|'), correct: q.correct }))
const rowToQuestion = (r: Record<string, string | number>): Question => ({
  prompt: String(r.prompt),
  options: String(r.options).split('|'),
  correct: Number(r.correct),
})

export const whatYouDidntKnow = defineGame({
  manifest: {
    id: 'what-you-didnt-know',
    name: "What, You Didn't Know That?",
    version: '0.1.0',
    description: 'A trivia gameshow: rising stakes, hidden answers, first to buzz in wins.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 1,
    flagship: true,
  },
  blocks: [buzzerBlock],
  defaultConfig: { title: SUBJECT, rounds: deckFrom(QUESTION_POOL.slice(0, ROUNDS_PER_GAME)) },
  // Deck-feedable: a creator can attach a Quiz Deck (question + options + correct columns)
  // to play their own multiple-choice questions. The `correct` index is the answer key,
  // withheld from non-owners (the options stay visible, like any buzzer round).
  contentPool: { defaultRows: DEFAULT_ROWS, deckKind: 'quiz', fromRow: choiceFromRow, answerColumns: ['correct', 'answer'] },
  buildConfig: (seed: string, opts?: { rounds?: number; rows?: Array<Record<string, string | number>> }) => {
    const rows = opts?.rows?.length ? opts.rows : DEFAULT_ROWS
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, rows.length))
    return { title: SUBJECT, rounds: deckFrom(seededShuffle(`wydk:${seed}`)(rows).slice(0, n).map(rowToQuestion)) }
  },
  roundOptions: { min: 3, max: 12, default: ROUNDS_PER_GAME, label: 'Questions' },
})
