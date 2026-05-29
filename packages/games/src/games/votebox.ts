/**
 * VoteBox — the composite, now genuinely built from blocks: alternating Guess
 * and Rate rounds. It composes the guess and rate blocks; it does not own any
 * views or scoring of its own.
 */
import { defineGame } from '@doot-games/sdk'
import { guessBlock } from '../blocks/guess/block'
import { rateBlock } from '../blocks/rate/block'
import type { RoundInstance } from '@doot-games/sdk'

const categories = [
  { id: 'art', label: 'Art Style' },
  { id: 'pose', label: 'Pose' },
  { id: 'pref', label: 'Personal Preference' },
]

function deck(): RoundInstance[] {
  const rounds: RoundInstance[] = []
  for (const subject of ['Character One', 'Character Two', 'Character Three']) {
    rounds.push({
      block: 'guess',
      content: {
        subject,
        prompt: 'Who is this?',
        image: '',
        timer: 20,
        options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
        correct: 0,
      },
    })
    rounds.push({
      block: 'rate',
      content: {
        subject,
        prompt: `Rate ${subject}`,
        image: '',
        timer: null,
        categories,
        scale: { kind: 'numeric', min: 1, max: 10, step: 1 },
      },
    })
  }
  return rounds
}

export const voteBox = defineGame({
  manifest: {
    id: 'votebox',
    name: 'VoteBox',
    version: '0.2.0',
    description: 'Guess characters and rate them — the party classic, composed from Guess + Rate.',
    author: 'Doot',
    capabilities: ['timer', 'images'],
    minPlayers: 1,
  },
  blocks: [guessBlock, rateBlock],
  defaultConfig: { title: 'Character Night', rounds: deck() },
})
