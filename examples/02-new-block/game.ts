/**
 * A game built from the new Slider block (Way 2). Once the block exists, a game
 * using it is just a composition (Way 1). Register both: export `sliderBlock`
 * from packages/games/src/index.ts, and add this game to the registry + catalog.
 */
import { defineGame } from '@doot-games/sdk'
import { sliderBlock } from './block'

export const hotTakes = defineGame({
  manifest: {
    id: 'hot-takes-slider',
    name: 'Hot Takes',
    version: '0.1.0',
    description: 'Slide to say how much you agree. The room average is the verdict.',
    author: 'you',
    capabilities: ['timer'],
    minPlayers: 1,
  },
  blocks: [sliderBlock],
  defaultConfig: {
    title: 'Hot Takes',
    rounds: [
      { block: 'slider', content: { prompt: 'Pineapple belongs on pizza.', image: '', lowLabel: 'Never', highLabel: 'Always', timer: 20 } },
      { block: 'slider', content: { prompt: 'Cereal is a soup.', image: '', lowLabel: 'No', highLabel: 'Yes', timer: 20 } },
    ],
  },
})
