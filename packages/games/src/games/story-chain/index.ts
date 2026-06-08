/**
 * Story Chain, a collaborative "telephone" / exquisite-corpse party game and the
 * first game on the P7 pipeline foundation. Everyone writes an opening line; each
 * round your line is passed one seat and the next player, seeing ONLY that line,
 * writes what comes next. After a few rounds every story has drifted somewhere
 * absurd, and the unspool reveals all of them at once.
 *
 * A STANDARD-COMPOSED game (it works in Sessions and the picker): a single block
 * (`chainline`) repeated, with each later round wired to read round 0 (for the
 * frozen ring) and the immediately-previous round (the line to build on) via
 * `RoundInstance.from`. Unscored; the only custom piece is the Results "unspool".
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { chainlineBlock } from '../../blocks/chainline/block'
import { seededShuffle } from '../../runtime/derive'
import StoryChainResults from './StoryChainResults.vue'

/** Gentle opening nudges for the seed round (one is picked per room). Party-safe,
 *  open-ended, no brand names. */
const SEEDS = [
  'Start a story. Any opening line will do.',
  'Begin a tale about the worst day someone ever had.',
  'Open a mystery: something has gone missing.',
  'Start an adventure that begins with a terrible plan.',
  'Begin a story about a very strange holiday.',
  'Open a tale about an animal with big dreams.',
  'Start a story that begins somewhere nobody expects.',
  'Begin a love story that starts with an argument.',
]

const DEFAULT_LINES = 6

/** Build the ordered chain rounds. Round 0 is the seed (no source); every later
 *  round reads the prior round (the line to continue) AND round 0 (the frozen ring
 *  of who is in the chain). */
function roundsFor(n: number, seedPrompt: string): RoundInstance[] {
  const rounds: RoundInstance[] = []
  for (let k = 0; k < n; k++) {
    const seed = k === 0
    const inst: RoundInstance = {
      block: 'chainline',
      content: {
        prompt: seed ? seedPrompt : 'Continue the story. You only see the last line.',
        step: k + 1,
        total: n,
        seed,
        timer: seed ? 75 : 60,
      },
    }
    if (!seed) inst.from = k === 1 ? [0] : [k - 1, 0]
    rounds.push(inst)
  }
  return rounds
}

export const storyChain = defineGame({
  manifest: {
    id: 'story-chain',
    name: 'Story Chain',
    version: '0.1.0',
    description: 'Pass-it-on storytelling: write a line, send it on, and watch each tale drift somewhere absurd.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [chainlineBlock],
  defaultConfig: { title: 'Story Chain', rounds: roundsFor(4, SEEDS[0] as string) },
  components: { Results: StoryChainResults },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    // Best with lines ~ number of players (each thread visits everyone once); with
    // more lines the threads simply wrap and travel the room again, which is fine
    // (you always continue your neighbor's latest line, never your own).
    const n = Math.max(3, Math.min(opts?.rounds ?? DEFAULT_LINES, 10))
    const seedPrompt = seededShuffle(`story-chain:${seed}`)(SEEDS)[0] as string
    return { title: 'Story Chain', rounds: roundsFor(n, seedPrompt) }
  },
  roundOptions: { min: 3, max: 10, default: DEFAULT_LINES, label: 'Lines' },
})
