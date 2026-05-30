/**
 * Rate, a single-type game composing only the rate block. Its default deck
 * uses a tier scale (D→S) to show off non-numeric scales.
 */
import { type RoundInstance, defineGame } from '@doot-games/sdk'
import { rateBlock } from '../blocks/rate/block'

const tierScale = {
  kind: 'levels' as const,
  levels: [
    { label: 'D', value: 1 },
    { label: 'C', value: 2 },
    { label: 'B', value: 3 },
    { label: 'A', value: 4 },
    { label: 'S', value: 5 },
  ],
}

const rounds: RoundInstance[] = ['Entry One', 'Entry Two', 'Entry Three'].map((subject) => ({
  block: 'rate',
  content: {
    subject,
    prompt: `Rate ${subject}`,
    image: '',
    timer: null,
    categories: [{ id: 'overall', label: 'Overall' }],
    scale: tierScale,
  },
}))

export const rate = defineGame({
  manifest: {
    id: 'rate',
    name: 'Rate',
    version: '0.2.0',
    description: 'Rate each subject on a scale you define, numbers, letter grades, or tiers.',
    author: 'Doot',
    capabilities: ['images'],
    minPlayers: 1,
  },
  blocks: [rateBlock],
  defaultConfig: { title: 'Tier List', rounds },
})
