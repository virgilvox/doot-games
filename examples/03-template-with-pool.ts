/**
 * Way 3: A remix/template with a replayable content pool.
 *
 * Same as Way 1 (a composition of existing blocks) but instead of a fixed deck,
 * the game carries a large POOL and a `buildConfig(seed)` that draws a fresh
 * random subset each play. The host calls `buildConfig(roomCode)`, so a room is
 * internally consistent (reconnect-safe) but no two rooms get the same game.
 *
 * `seededShuffle(seed)` is a deterministic shuffle exported from @doot-games/games.
 * This is exactly how Quip Clash / Mad Libs / Split the Room stay fresh.
 */
import { guessBlock, seededShuffle } from '@doot-games/games'
import { type GameComposition, defineGame } from '@doot-games/sdk'

interface Q {
  prompt: string
  options: string[]
  correct: number
}

const QUESTION_POOL: Q[] = [
  { prompt: 'Which planet is the hottest?', options: ['Mercury', 'Venus', 'Mars', 'Jupiter'], correct: 1 },
  { prompt: 'A group of crows is called a…', options: ['Pod', 'Murder', 'Herd', 'Flock'], correct: 1 },
  { prompt: 'What year did the first iPhone ship?', options: ['2005', '2007', '2009', '2010'], correct: 1 },
  { prompt: 'Which is NOT a primary color of light?', options: ['Red', 'Green', 'Yellow', 'Blue'], correct: 2 },
  { prompt: 'The Great Wall is mostly in which country?', options: ['Japan', 'China', 'Korea', 'Mongolia'], correct: 1 },
  { prompt: 'How many strings does a standard violin have?', options: ['4', '5', '6', '7'], correct: 0 },
  { prompt: 'Which gas do plants mostly breathe in?', options: ['Oxygen', 'Nitrogen', 'CO₂', 'Helium'], correct: 2 },
  // ...add as many as you like; the more, the more replayable.
]

const ROUNDS_PER_GAME = 5

function deckFrom(questions: Q[]): GameComposition['rounds'] {
  return questions.map((q) => ({
    block: 'guess',
    content: {
      subject: '',
      prompt: q.prompt,
      image: '',
      timer: 20,
      options: q.options.map((label) => ({ label })),
      correct: q.correct,
    },
  }))
}

export const triviaPool = defineGame({
  manifest: {
    id: 'trivia-pool',
    name: 'Trivia Pool',
    version: '0.1.0',
    description: 'Fast multiple-choice trivia. A fresh set of questions every game.',
    author: 'you',
    capabilities: ['timer'],
    minPlayers: 1,
    // `flagship: true` + a `buildConfig` pool makes this a ready-to-play
    // "Game From Doot" (shown as Host-now on Explore), not just a template.
    flagship: true,
  },
  blocks: [guessBlock],
  // A small fixed deck for the editor preview / fallback.
  defaultConfig: { title: 'Trivia Pool', rounds: deckFrom(QUESTION_POOL.slice(0, ROUNDS_PER_GAME)) },
  // Each play: shuffle the pool by the room code, take a fresh set.
  buildConfig: (seed: string): GameComposition => ({
    title: 'Trivia Pool',
    rounds: deckFrom(seededShuffle(`trivia:${seed}`)(QUESTION_POOL).slice(0, ROUNDS_PER_GAME)),
  }),
})
