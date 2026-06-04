/**
 * Split the Room, the third flagship and the inverted-objective game: each player
 * completes a dividing "Would you...?" dilemma, then the room votes YES/NO on every
 * (anonymized) scenario, and authors score on how close their scenario splits the
 * room to 50/50. You don't want to be liked or right, you want to divide.
 *
 * Composition: [fill (complete the dilemma), split (vote + closeness score)] pairs.
 * The split round derives its scenarios from the fill round (via the fill block's
 * toVoteText + DeriveSource.render). A fresh set of frames is drawn each play.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { fillBlock } from '../../blocks/fill/block'
import { splitBlock } from '../../blocks/split/block'
import { seededShuffle } from '../../runtime/derive'

/** Dividing frames; `{x}` is the blank the player completes to split the room. */
const FRAME_POOL: string[] = [
  'Would you {x} for one million dollars?',
  'Would you give up {x} forever to never pay taxes again?',
  'Is it ever okay to {x}?',
  'Would you rather always {x} than ever check your phone again?',
  'Should it be illegal to {x}?',
  'Would you {x} in front of your boss for $10,000?',
  'Would you trust a friend who {x}?',
  'Would you eat {x} if a stranger paid you $50?',
  'On a first date, is {x} a dealbreaker?',
  'Would you {x} to win this game right now?',
  'Would you let your group chat see {x}?',
  'Would you {x} every day for a year for early retirement?',
]

const ROUNDS_PER_GAME = 2

/** Ready-made dilemmas for a player who runs out of time, so the vote has no gap
 *  and nobody is at zero (scored at half). Generic "would you" tough calls. */
const SAFETY_DILEMMAS: string[] = [
  'Would you give up the internet for a year for $50,000?',
  'Would you always be 10 minutes late if it meant never being early?',
  'Would you read minds if you could never turn it off?',
  'Would you eat only pizza forever if it stayed delicious?',
]

function pair(frame: string): RoundInstance[] {
  return [
    {
      block: 'fill',
      content: {
        subject: '',
        prompt: 'Complete the dilemma to divide the room',
        template: frame,
        blanks: [{ id: 'x', label: 'Fill the blank (make it a tough call!)' }],
        maxLength: 60,
        timer: 50,
        showTemplate: true,
        safetyAnswers: SAFETY_DILEMMAS,
      },
    },
    { block: 'split', content: { prompt: 'Would you? Vote yes or no on each', scenarios: [], timer: 40 } },
  ]
}

function deckFrom(frames: string[]): RoundInstance[] {
  return frames.flatMap(pair)
}

export const splitRoom = defineGame({
  manifest: {
    id: 'split-room',
    name: 'Split the Room',
    version: '0.1.0',
    description: 'Complete a "would you...?" dilemma, then the room votes yes or no. Score by dividing the room as close to 50/50 as you can.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [fillBlock, splitBlock],
  defaultConfig: { title: 'Split the Room', rounds: deckFrom(FRAME_POOL.slice(0, ROUNDS_PER_GAME)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, FRAME_POOL.length))
    return { title: 'Split the Room', rounds: deckFrom(seededShuffle(`split:${seed}`)(FRAME_POOL).slice(0, n)) }
  },
  roundOptions: { min: 1, max: 5, default: ROUNDS_PER_GAME, label: 'Dilemmas' },
})
