/**
 * Open Mic, Circuit Cypher's deadpan twin for jokes: players write a one-liner to
 * a comedy premise, then the robots DELIVER each joke aloud over TTS before the
 * room votes for the funniest. It is pure composition, [quip, vote(perform), ...],
 * reusing the same two-phase spine as Quip Clash plus the `vote` block's `perform`
 * flag (the rap-battle "read it aloud" moment, here played for laughs).
 *
 * Each play draws fresh premises from a large pool (`buildConfig`, seeded by the
 * room code) so no two rooms get the same set.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { quipBlock } from '../blocks/quip/block'
import { voteBlock } from '../blocks/vote/block'
import { seededShuffle } from '../runtime/derive'

/** Comedy premises: write a punchy one-liner, the robot reads it deadpan. */
const PREMISE_POOL: string[] = [
  'Write a one-liner about Mondays.',
  'Tell a joke a robot would find hilarious.',
  'Your worst piece of dating advice, as a joke.',
  'A one-liner about working from home.',
  'Open for a comedy set in a town with one stoplight.',
  'A joke that only makes sense at 3am.',
  'Roast the concept of meetings in one line.',
  'A one-liner about your phone battery.',
  'Tell a joke about cats plotting something.',
  'The punchline to a joke that has no setup.',
  'A one-liner you would put on a motivational poster (ironically).',
  'A joke about the gym you never go to.',
  'Comedy bit: explain airplane food, but make it funny.',
  'A one-liner about being an adult.',
  'Tell a joke about the future that is too real.',
  'A one-liner about coffee.',
  'The worst opening line for a wedding speech.',
  'A joke about your group chat.',
  'A one-liner about Mondays, but for robots.',
  'Heckle the host in one polite line.',
]

const ROUNDS_PER_GAME = 3

/** Build one make+perform-vote pair for a premise. The vote derives from the quip. */
function pair(premise: string): RoundInstance[] {
  return [
    {
      block: 'quip',
      content: {
        prompt: premise,
        placeholder: 'Your bit...',
        maxLength: 140,
        timer: 75,
      },
    },
    // perform:true makes the robots read each joke aloud before the room votes.
    { block: 'vote', content: { prompt: 'Funniest bit wins', options: [], mode: 'field', timer: 30, perform: true } },
  ]
}

function deckFrom(premises: string[]): RoundInstance[] {
  return premises.flatMap(pair)
}

export const openMic = defineGame({
  manifest: {
    id: 'open-mic',
    name: 'Open Mic',
    version: '0.1.0',
    description: 'Write a one-liner, let the robots deliver it deadpan, then vote for the funniest bit.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [quipBlock, voteBlock],
  defaultConfig: { title: 'Open Mic', rounds: deckFrom(PREMISE_POOL.slice(0, ROUNDS_PER_GAME)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(1, Math.min(opts?.rounds ?? ROUNDS_PER_GAME, PREMISE_POOL.length))
    return { title: 'Open Mic', rounds: deckFrom(seededShuffle(`openmic:${seed}`)(PREMISE_POOL).slice(0, n)) }
  },
  roundOptions: { min: 1, max: 8, default: ROUNDS_PER_GAME, label: 'Premises' },
})
