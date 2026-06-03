/** Guess, a single-type game composing only the guess block. */
import { type RoundInstance, defineGame } from '@doot-games/sdk'
import { guessBlock } from '../../blocks/guess/block'

const rounds: RoundInstance[] = ['Round One', 'Round Two', 'Round Three'].map((subject) => ({
  block: 'guess',
  content: {
    subject,
    prompt: 'Who is this?',
    image: '',
    timer: 20,
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
    correct: 0,
  },
}))

export const guess = defineGame({
  manifest: {
    id: 'guess',
    name: 'Guess',
    version: '0.2.0',
    description: 'Show a prompt or image, give multiple choices, one is correct.',
    author: 'Doot',
    capabilities: ['timer', 'images'],
    minPlayers: 1,
  },
  blocks: [guessBlock],
  defaultConfig: { title: 'Guessing Game', rounds },
})
