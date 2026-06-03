/** Buzzer, a single-type trivia game composing only the buzzer block: a question
 *  appears, the first correct buzz-in scores the most, and the stakes rise each
 *  round. Like Guess/Poll, it is a primitive single-block game (not a flagship),
 *  so it shows up in the "Build from blocks" row on Create. */
import { type RoundInstance, defineGame } from '@doot-games/sdk'
import { buzzerBlock } from '../../blocks/buzzer/block'

// Three rounds with rising stakes; the author swaps in their own questions.
const rounds: RoundInstance[] = [
  {
    block: 'buzzer',
    content: {
      subject: 'Warm-up',
      prompt: 'Which planet is closest to the Sun?',
      image: '',
      timer: 20,
      options: [{ label: 'Mercury' }, { label: 'Venus' }, { label: 'Mars' }, { label: 'Earth' }],
      correct: 0,
      points: 100,
    },
  },
  {
    block: 'buzzer',
    content: {
      subject: 'Getting harder',
      prompt: 'How many bones are in the adult human body?',
      image: '',
      timer: 20,
      options: [{ label: '206' }, { label: '198' }, { label: '224' }, { label: '180' }],
      correct: 0,
      points: 200,
    },
  },
  {
    block: 'buzzer',
    content: {
      subject: 'For the win',
      prompt: 'Which element has the chemical symbol "Au"?',
      image: '',
      timer: 20,
      options: [{ label: 'Gold' }, { label: 'Silver' }, { label: 'Aluminum' }, { label: 'Argon' }],
      correct: 0,
      points: 300,
    },
  },
]

export const buzzer = defineGame({
  manifest: {
    id: 'buzzer',
    name: 'Buzzer',
    version: '0.1.0',
    description: 'First-correct trivia: buzz in fast, the quickest right answer scores the most.',
    author: 'Doot',
    capabilities: ['timer', 'images'],
    minPlayers: 1,
  },
  blocks: [buzzerBlock],
  defaultConfig: { title: 'Buzzer Round', rounds },
})
