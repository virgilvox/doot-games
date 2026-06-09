/**
 * Wavelength (the clue-giver dial), the §2 spectrum the plan intended and the first
 * game to use the P7 foundation in a JUDGE round. Each "read" is two rounds of the one
 * `wavelength` block: a clue-giver (rotating each read) is shown a secret target on a
 * spectrum and writes a clue, then everyone else guesses where it lands. Guessers score
 * by closeness; the clue-giver scores by how well the room landed on their clue.
 *
 * Standard-composed (so it works in Sessions + the picker): the guess round reads its
 * clue round via `RoundInstance.from`. The target is withheld (redactContent + a
 * REDACTION_RULES entry) and reaches only the clue-giver's private address.
 */
import { defineGame } from '@doot-games/sdk'
import type { RoundInstance } from '@doot-games/sdk'
import { wavelengthBlock } from '../../blocks/wavelength/block'
import { seededShuffle } from '../../runtime/derive'

/** Party-safe spectrum axes (left pole / right pole). */
const AXES: Array<{ left: string; right: string }> = [
  { left: 'Cold', right: 'Hot' },
  { left: 'Underrated', right: 'Overrated' },
  { left: 'Useless', right: 'Useful' },
  { left: 'Boring', right: 'Exciting' },
  { left: 'Cheap', right: 'Expensive' },
  { left: 'Weird', right: 'Normal' },
  { left: 'Forgettable', right: 'Iconic' },
  { left: 'Unhealthy', right: 'Healthy' },
  { left: 'Old-school', right: 'Modern' },
  { left: 'Quiet', right: 'Loud' },
  { left: 'Scary', right: 'Cute' },
  { left: 'Casual', right: 'Formal' },
]
/** Target positions (avoiding the dead-easy extremes), shuffled per room. */
const TARGETS = [12, 22, 31, 38, 45, 52, 60, 68, 77, 85, 90, 18]

const DEFAULT_READS = 5

function roundsFor(axes: Array<{ left: string; right: string }>, targets: number[]): RoundInstance[] {
  const rounds: RoundInstance[] = []
  axes.forEach((ax, k) => {
    const base = { leftLabel: ax.left, rightLabel: ax.right, target: targets[k] ?? 50, item: k, timer: 45 }
    rounds.push({ block: 'wavelength', content: { phase: 'clue', ...base } })
    rounds.push({ block: 'wavelength', content: { phase: 'guess', ...base }, from: [2 * k] })
  })
  return rounds
}

export const wavelength = defineGame({
  manifest: {
    id: 'wavelength',
    name: 'Wavelength',
    version: '0.1.0',
    description: 'One player sees a secret point on a spectrum and gives a clue. The room guesses where it lands.',
    author: 'Doot',
    capabilities: ['timer'],
    minPlayers: 3,
    flagship: true,
  },
  blocks: [wavelengthBlock],
  defaultConfig: { title: 'Wavelength', rounds: roundsFor(AXES.slice(0, 3), TARGETS.slice(0, 3)) },
  buildConfig: (seed: string, opts?: { rounds?: number }) => {
    const n = Math.max(3, Math.min(opts?.rounds ?? DEFAULT_READS, 10))
    const axes = seededShuffle(`wavelength:${seed}`)(AXES).slice(0, n)
    const targets = seededShuffle(`wavelength:t:${seed}`)(TARGETS).slice(0, n)
    return { title: 'Wavelength', rounds: roundsFor(axes, targets) }
  },
  roundOptions: { min: 3, max: 10, default: DEFAULT_READS, label: 'Reads' },
})
