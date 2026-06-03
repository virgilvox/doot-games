/**
 * Hivemind, the "read the room" game (a Herd Mentality / family-feud cousin Doot
 * was missing). Each round everyone answers the same open prompt; you score by
 * giving the SAME answer as the most other players. It is a single-block
 * composition over the `hivemind` block, drawing a fresh set of prompts from a
 * large pool each play (`buildConfig`, seeded by the room code).
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { hivemindBlock } from '../../blocks/hivemind/block'
import { seededShuffle } from '../../runtime/derive'

/** Prompts with an obvious crowd answer to converge on. */
const PROMPT_POOL: string[] = [
  'Name something you find in a kitchen.',
  'Name a color of the rainbow.',
  'Name a popular pizza topping.',
  'Name an animal you might see at a zoo.',
  'Name a day people dread.',
  'Name a fruit that is red.',
  'Name something you do every morning.',
  'Name a famous superhero.',
  'Name a board game.',
  'Name something in your pocket or bag right now.',
  'Name a season of the year.',
  'Name a fast food chain.',
  'Name a planet.',
  'Name a thing you bring to the beach.',
  'Name a breakfast food.',
  'Name a body part with five letters.',
  'Name a mode of transport.',
  'Name a holiday.',
  'Name something cold.',
  'Name a musical instrument.',
]

const ROUNDS_PER_GAME = 5

function deckFrom(prompts: string[]): RoundInstance[] {
  return prompts.map((prompt) => ({
    block: 'hivemind',
    content: { prompt, placeholder: '', maxLength: 40, timer: 30 },
  }))
}

export const hivemind = defineGame({
  manifest: {
    id: 'hivemind',
    name: 'Hivemind',
    version: '0.1.0',
    description: 'Answer the prompt the same way as everyone else. Reading the room is the whole game.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 2,
    flagship: true,
  },
  blocks: [hivemindBlock],
  defaultConfig: { title: 'Hivemind', rounds: deckFrom(PROMPT_POOL.slice(0, ROUNDS_PER_GAME)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, PROMPT_POOL.length))
    return { title: 'Hivemind', rounds: deckFrom(seededShuffle(`hivemind:${seed}`)(PROMPT_POOL).slice(0, n)) }
  },
  roundOptions: { min: 3, max: 12, default: ROUNDS_PER_GAME, label: 'Prompts' },
})
