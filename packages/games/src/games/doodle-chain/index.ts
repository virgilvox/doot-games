/**
 * Doodle Chain (Gartic Phone), a draw-and-describe telephone game and the second game
 * on the P7 pipeline foundation. Everyone writes a prompt; the next player draws it,
 * the next describes the drawing, the next draws that, and so on. At the end every
 * chain unspools as prompt -> drawing -> guess -> drawing, usually somewhere absurd.
 *
 * A STANDARD-COMPOSED game (so it works in Sessions + the picker): a single block
 * (`doodle`) repeated with alternating `mode`, each later round wired to read round 0
 * (the frozen ring) and the immediately-previous round (the thing to build on) via
 * `RoundInstance.from`. Unscored; the only custom piece is the gallery "unspool".
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { doodleBlock } from '../../blocks/doodle/block'
import { seededShuffle } from '../../runtime/derive'
import DoodleChainResults from './DoodleChainResults.vue'

const DEFAULT_ROUNDS = 6

/** Gentle nudges for the opening prompt (one is picked per room, for variety). */
const SEEDS = [
  'Write something for the next player to draw.',
  'Write the most absurd thing you can for someone to draw.',
  'Describe a scene for someone to draw.',
  'Write a tiny story moment for someone to draw.',
  'Name something that would be very hard to draw.',
  'Write a mashup of two things for someone to draw.',
]

/** Build the ordered chain rounds: round 0 writes a prompt (the seed), then rounds
 *  alternate drawing the text you got and describing the drawing you got. Every later
 *  round reads the prior round (the thing to build on) AND round 0 (the frozen ring). */
function roundsFor(n: number, seedPrompt: string): RoundInstance[] {
  const rounds: RoundInstance[] = []
  for (let k = 0; k < n; k++) {
    const seed = k === 0
    const mode: 'draw' | 'describe' = seed ? 'describe' : k % 2 === 1 ? 'draw' : 'describe'
    const prompt = seed ? seedPrompt : mode === 'draw' ? 'Draw the prompt you were given.' : 'What is this drawing?'
    const inst: RoundInstance = {
      block: 'doodle',
      content: { mode, prompt, step: k + 1, total: n, seed, aspect: 0.7, timer: mode === 'draw' ? 90 : 45 },
    }
    if (!seed) inst.from = k === 1 ? [0] : [k - 1, 0]
    rounds.push(inst)
  }
  return rounds
}

export const doodleChain = defineGame({
  manifest: {
    id: 'doodle-chain',
    name: 'Doodle Chain',
    version: '0.1.0',
    description: 'Draw-and-describe telephone: write a prompt, draw what you got, guess the drawing, and watch each chain go sideways.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [doodleBlock],
  defaultConfig: { title: 'Doodle Chain', rounds: roundsFor(4, SEEDS[0] as string) },
  components: { Results: DoodleChainResults },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    // Best with rounds ~ number of players (each chain visits everyone once); with
    // more the chains simply wrap and travel the room again, which is fine.
    const n = Math.max(4, Math.min(opts?.rounds ?? DEFAULT_ROUNDS, 10))
    const seedPrompt = seededShuffle(`doodle-chain:${seed}`)(SEEDS)[0] as string
    return { title: 'Doodle Chain', rounds: roundsFor(n, seedPrompt) }
  },
  roundOptions: { min: 4, max: 8, default: DEFAULT_ROUNDS, label: 'Rounds' },
})
