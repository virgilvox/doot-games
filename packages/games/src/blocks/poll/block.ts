/**
 * Poll block, an opinion question with no right answer. Players pick one
 * option; reveal shows the live distribution. Distinct from Rate: Poll is a
 * single choice across options, Rate scores subjects on a scale.
 */
import {
  type BlockResultsContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  z,
} from '@doot-games/sdk'
import PollHost from './PollHost.vue'
import PollPlayer from './PollPlayer.vue'
import PollReveal from './PollReveal.vue'

export const pollContentSchema = z.object({
  prompt: z.string().default('What do you think?'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null)
    .describe('Seconds to vote. Off = open until you close it (a poll has no wrong answer).'),
  options: z.array(z.object({ label: z.string().default('') })).min(2).describe('At least two choices.'),
})

export type PollContent = z.infer<typeof pollContentSchema>
export interface PollInput {
  choice: number | null
}
/** The public per-round reveal phones read to show "you vs the room". */
export interface PollRevealSummary {
  counts: number[]
  /** The room's most-picked option index, or -1 if nobody voted. */
  topIndex: number
  topLabel: string
  total: number
}

export const pollBlock = defineBlock<PollContent, PollInput>({
  kind: 'poll',
  name: 'Poll',
  contentSchema: pollContentSchema,
  defaultContent: () => ({
    prompt: 'What do you think?',
    image: '',
    timer: null,
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }],
  }),
  defaultTimer: null,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: null }),
  isComplete: (_c, input) => input.choice != null,
  PlayerInput: PollPlayer,
  HostDisplay: PollHost,
  PlayerReveal: PollReveal,
  // No answer to withhold (a poll has no right answer), so the per-round reveal is
  // safe to publish: the live tally + the room's top pick, for phone feedback.
  revealSummary: (ctx: RevealContext<PollContent, PollInput>): PollRevealSummary => {
    const counts = ctx.content.options.map(() => 0)
    for (const input of ctx.inputs.values()) {
      const c = (input as PollInput | null)?.choice
      if (c != null && c >= 0 && c < counts.length) counts[c] = (counts[c] ?? 0) + 1
    }
    let topIndex = -1
    let topVotes = -1
    counts.forEach((n, i) => {
      if (n > topVotes) {
        topVotes = n
        topIndex = i
      }
    })
    const total = counts.reduce((a, b) => a + b, 0)
    return {
      counts,
      topIndex: total > 0 ? topIndex : -1,
      topLabel: total > 0 ? (ctx.content.options[topIndex]?.label ?? '') : '',
      total,
    }
  },
  aggregate: (ctx: BlockResultsContext<PollContent, PollInput>): ResultsFragment => {
    const distributions = ctx.rounds.map(({ index, content }) => {
      const counts = content.options.map(() => 0)
      for (const input of ctx.inputsFor(index).values()) {
        const choice = input?.choice
        if (choice != null && choice >= 0 && choice < counts.length) counts[choice] = (counts[choice] ?? 0) + 1
      }
      return {
        title: content.prompt,
        bars: content.options.map((o, oi) => ({
          label: o.label || `Option ${oi + 1}`,
          count: counts[oi] ?? 0,
        })),
      }
    })
    const totalVotes = distributions.reduce(
      (sum, d) => sum + d.bars.reduce((s, b) => s + b.count, 0),
      0,
    )
    return {
      distributions,
      stats: [
        { label: 'Questions', value: ctx.rounds.length },
        { label: 'Votes cast', value: totalVotes },
      ],
    }
  },
})
