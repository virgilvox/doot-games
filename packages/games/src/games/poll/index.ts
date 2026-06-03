/** Poll (Pulse), opinion questions with no right answer, composing the poll block. */
import { type RoundInstance, defineGame } from '@doot-games/sdk'
import { pollBlock } from '../../blocks/poll/block'

const rounds: RoundInstance[] = [
  {
    block: 'poll',
    content: {
      prompt: 'Pineapple on pizza?',
      image: '',
      timer: null,
      options: [{ label: 'Absolutely' }, { label: 'Never' }, { label: 'Only sometimes' }],
    },
  },
  {
    block: 'poll',
    content: {
      prompt: 'Best way to spend a day off?',
      image: '',
      timer: null,
      options: [{ label: 'Outside' }, { label: 'Gaming' }, { label: 'Sleeping' }, { label: 'Reading' }],
    },
  },
  {
    block: 'poll',
    content: {
      prompt: 'Tabs or spaces?',
      image: '',
      timer: 20,
      options: [{ label: 'Tabs' }, { label: 'Spaces' }],
    },
  },
]

export const poll = defineGame({
  manifest: {
    id: 'poll',
    name: 'Poll',
    version: '0.1.0',
    description: 'Ask opinion questions with no right answer; reveal shows the live distribution.',
    author: 'Doot',
    capabilities: ['untimed'],
    minPlayers: 1,
  },
  blocks: [pollBlock],
  defaultConfig: { title: 'Hot Takes', rounds },
})
