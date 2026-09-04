/** Rank, order items and see the room's consensus, composing the rank block. */
import { type RoundInstance, defineGame } from '@doot-games/sdk'
import { rankBlock } from '../../blocks/rank/block'

const rounds: RoundInstance[] = [
  {
    block: 'rank',
    content: {
      prompt: 'Rank the snacks, best to worst',
      image: '',
      timer: null,
      items: [
        { id: 'chips', label: 'Chips', image: '' },
        { id: 'popcorn', label: 'Popcorn', image: '' },
        { id: 'pretzels', label: 'Pretzels', image: '' },
        { id: 'nuts', label: 'Nuts', image: '' },
        { id: 'candy', label: 'Candy', image: '' },
      ],
    },
  },
  {
    block: 'rank',
    content: {
      prompt: 'Rank the seasons',
      image: '',
      timer: null,
      items: [
        { id: 'spring', label: 'Spring', image: '' },
        { id: 'summer', label: 'Summer', image: '' },
        { id: 'fall', label: 'Fall', image: '' },
        { id: 'winter', label: 'Winter', image: '' },
      ],
    },
  },
]

export const rank = defineGame({
  manifest: {
    id: 'rank',
    name: 'Rank',
    version: '0.1.0',
    description: 'Order a set of items; the room aggregates into one consensus ranking.',
    author: 'Doot',
    capabilities: ['untimed'],
    minPlayers: 1,
  },
  blocks: [rankBlock],
  defaultConfig: { title: 'Rank It', rounds },
})
