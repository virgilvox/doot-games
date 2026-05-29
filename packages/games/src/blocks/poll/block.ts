/**
 * Poll block — an opinion question with no right answer. Players pick one
 * option; reveal shows the live distribution. Distinct from Rate: Poll is a
 * single choice across options, Rate scores subjects on a scale.
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import PollHost from './PollHost.vue'
import PollPlayer from './PollPlayer.vue'

export const pollContentSchema = z.object({
  prompt: z.string().default('What do you think?'),
  image: z.string().default(''),
  timer: z.number().int().nonnegative().nullable().default(null),
  options: z.array(z.object({ label: z.string().default('') })).min(2),
})

export type PollContent = z.infer<typeof pollContentSchema>
export interface PollInput {
  choice: number | null
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
  aggregate: (ctx: BlockResultsContext<PollContent, PollInput>): ResultsFragment => {
    const distributions = ctx.rounds.map(({ index, content }) => {
      const counts = content.options.map(() => 0)
      for (const input of ctx.inputsFor(index).values()) {
        if (input?.choice != null && counts[input.choice] != null) counts[input.choice]++
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
