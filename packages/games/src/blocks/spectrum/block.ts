/**
 * Spectrum block (the consensus dial). Everyone places the subject on a 0-100 dial
 * between two poles; you score by landing near the room's CONSENSUS (the mean). A
 * standard block: nothing is withheld (there is no authored answer, the target is
 * the emergent mean computed at reveal), so no redaction is needed. Points-style
 * scored, so it works with teams + the running standings.
 *
 * NOTE: this is the crowd-consensus variant, NOT the clue-giver "Wavelength" (which
 * needs per-player views inside a derived round, an engine gap; see the plan).
 */
import { isEligible } from '@doot-games/engine'
import {
  type BlockResultsContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import SpectrumHost from './SpectrumHost.vue'
import SpectrumPlayer from './SpectrumPlayer.vue'
import SpectrumReveal from './SpectrumReveal.vue'
import { type SpectrumContent, type SpectrumInput, scoreSpectrum } from './logic'

export const spectrumContentSchema = z.object({
  prompt: promptText('Pineapple on pizza'),
  leftLabel: z.string().min(1).default('Disgusting').describe('The left pole of the dial.'),
  rightLabel: z.string().min(1).default('Delicious').describe('The right pole of the dial.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(30)
    .describe('Seconds to place your dial. Turn off for an untimed round.'),
})

/** The public reveal payload phones read: the consensus + all placements. */
export interface SpectrumRevealSummary {
  mean: number | null
  marks: number[]
}

export const spectrumBlock = defineBlock<SpectrumContent, SpectrumInput>({
  kind: 'spectrum',
  name: 'Spectrum',
  scoring: 'Score by how close your guess lands to the room average.',
  contentSchema: spectrumContentSchema,
  defaultContent: () => ({ prompt: 'Pineapple on pizza', leftLabel: 'Disgusting', rightLabel: 'Delicious', timer: 30 }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ value: null }),
  isComplete: (_c, input) => input.value != null,
  PlayerInput: SpectrumPlayer,
  HostDisplay: SpectrumHost,
  PlayerReveal: SpectrumReveal,

  revealSummary: (ctx: RevealContext<SpectrumContent, SpectrumInput>): SpectrumRevealSummary => {
    const { mean, marks } = scoreSpectrum(ctx.inputs as Map<string, SpectrumInput>)
    return { mean, marks: marks.map((m) => m.value) }
  },

  aggregate: (ctx: BlockResultsContext<SpectrumContent, SpectrumInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex, score: 0 }))
    const byId = new Map(totals.map((t) => [t.id, t]))
    for (const { index } of ctx.rounds) {
      const { scores } = scoreSpectrum(ctx.inputsFor(index) as Map<string, SpectrumInput>)
      for (const [pid, s] of scores) {
        const t = byId.get(pid)
        if (!t || !isEligible(t.joinedAtIndex, index)) continue
        t.score += s
      }
    }
    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      headline: totals[0]?.score ? `${totals[0].name} reads the room` : undefined,
      leaderboard: totals.map((t) => ({ id: t.id, name: t.name, score: t.score, detail: `${t.score} pts` })),
      stats: [
        { label: 'Spectrums', value: ctx.rounds.length },
        { label: 'Top score', value: totals[0]?.score ?? 0 },
      ],
    }
  },
})
