/** Draw — sketch the prompt; everyone's drawings fill the screen. Single-block. */
import { type RoundInstance, defineGame } from '@doot-games/sdk'
import { drawBlock } from '../blocks/draw/block'

const rounds: RoundInstance[] = [
  { block: 'draw', content: { prompt: 'Draw the secret word: PINEAPPLE 🍍', image: '', timer: 60, aspect: 0.7 } },
  { block: 'draw', content: { prompt: 'Your pet as a superhero', image: '', timer: 90, aspect: 0.7 } },
  { block: 'draw', content: { prompt: 'The worst possible tattoo', image: '', timer: 60, aspect: 0.7 } },
]

export const draw = defineGame({
  manifest: {
    id: 'draw',
    name: 'Draw',
    version: '0.1.0',
    description: "Sketch the prompt on your phone; everyone's drawings fill the big screen.",
    author: 'Doot',
    capabilities: ['timer', 'drawing'],
    minPlayers: 1,
  },
  blocks: [drawBlock],
  defaultConfig: { title: 'Draw Party', rounds },
})
