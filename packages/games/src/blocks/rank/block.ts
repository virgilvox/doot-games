/**
 * Rank block — players order a set of items; the room's choices aggregate into
 * one consensus ranking, shown as an ordered chart. A no-winner, opinion-style
 * mechanic (debates, tier lists, "rank these from best to worst").
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import RankHost from './RankHost.vue'
import RankPlayer from './RankPlayer.vue'

export const rankContentSchema = z.object({
  prompt: z.string().default('Rank these'),
  image: z.string().default(''),
  timer: z.number().int().nonnegative().nullable().default(null),
  items: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
})
export type RankContent = z.infer<typeof rankContentSchema>
export interface RankInput {
  /** Item ids in the player's chosen order. */
  order: string[]
}

export const rankBlock = defineBlock<RankContent, RankInput>({
  kind: 'rank',
  name: 'Rank',
  contentSchema: rankContentSchema,
  defaultContent: () => ({
    prompt: 'Rank these',
    image: '',
    timer: null,
    items: [
      { id: 'a', label: 'Option A' },
      { id: 'b', label: 'Option B' },
      { id: 'c', label: 'Option C' },
    ],
  }),
  defaultTimer: null,
  timerOf: (c) => c.timer,
  emptyInput: (c) => ({ order: c.items.map((i) => i.id) }),
  isComplete: (c, input) => input.order.length === c.items.length,
  PlayerInput: RankPlayer,
  HostDisplay: RankHost,
  aggregate: (ctx: BlockResultsContext<RankContent, RankInput>): ResultsFragment => {
    const distributions = ctx.rounds.map(({ index, content }) => {
      const ranked = consensus(content, ctx.inputsFor(index))
      const n = content.items.length
      return {
        title: content.prompt,
        bars: ranked.map((r, rank) => ({
          label: r.label,
          count: n - rank, // #1 gets the fullest bar
          display: `#${rank + 1}`,
          note: `avg ${r.avg.toFixed(1)}`,
        })),
      }
    })
    return {
      headline: 'The results are in',
      distributions,
      stats: [{ label: 'Rank rounds', value: ctx.rounds.length }],
    }
  },
})

/** Average each item's position across players; lower average ranks higher. */
function consensus(content: RankContent, inputs: Map<string, RankInput>) {
  const totals = new Map<string, { sum: number; n: number }>()
  for (const item of content.items) totals.set(item.id, { sum: 0, n: 0 })
  for (const input of inputs.values()) {
    if (!Array.isArray(input?.order)) continue
    input.order.forEach((id, pos) => {
      const t = totals.get(id)
      if (t) {
        t.sum += pos
        t.n++
      }
    })
  }
  return content.items
    .map((item, i) => {
      const t = totals.get(item.id)
      // No votes yet: keep the authored order via the index as a tiebreaker.
      const avg = t && t.n > 0 ? t.sum / t.n : i
      return { id: item.id, label: item.label, avg }
    })
    .sort((a, b) => a.avg - b.avg)
}

export { consensus }
