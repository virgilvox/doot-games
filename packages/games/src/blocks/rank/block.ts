/**
 * Rank block, players order a set of items; the room's choices aggregate into
 * one consensus ranking, shown as an ordered chart. A no-winner, opinion-style
 * mechanic (debates, tier lists, "rank these from best to worst").
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import RankHost from './RankHost.vue'
import RankPlayer from './RankPlayer.vue'

export const rankContentSchema = z.object({
  prompt: z.string().default('Rank these'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null)
    .describe('Seconds to rank. Turn off for an untimed round.'),
  items: z
    .array(z.object({ id: z.string().min(1).describe('Internal id (auto-filled).'), label: z.string().min(1) }))
    .min(2)
    .describe('The things players drag into order (at least two).'),
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
  // Seed each player with a SHUFFLED order, not the authored one. A ranking has no
  // natural "empty" state and the player UI renders this order directly, so a
  // player who locks in without reordering casts a ballot regardless. Shuffling
  // per player makes those passive ballots average to noise instead of
  // systematically crowning the author's declared order (consensus bias).
  emptyInput: (c) => ({ order: shuffleIds(c.items.map((i) => i.id)) }),
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
          max: n, // fill against item count, not a vote sum
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

/** A per-player random order so a no-op submit doesn't bias toward the author's
 *  declared order. Uses Math.random by design (we want per-player variation). */
function shuffleIds(ids: string[]): string[] {
  const out = [...ids]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as string, out[i] as string]
  }
  return out
}

/** Average each item's position across players; lower average ranks higher. */
function consensus(content: RankContent, inputs: Map<string, RankInput>) {
  const totals = new Map<string, { sum: number; n: number }>()
  for (const item of content.items) totals.set(item.id, { sum: 0, n: 0 })
  for (const input of inputs.values()) {
    if (!Array.isArray(input?.order)) continue
    // Count each id at most once per ballot (defend against malformed payloads).
    const seen = new Set<string>()
    input.order.forEach((id, pos) => {
      if (seen.has(id)) return
      seen.add(id)
      const t = totals.get(id)
      if (t) {
        t.sum += pos
        t.n++
      }
    })
  }
  const n = content.items.length
  return content.items
    .map((item) => {
      const t = totals.get(item.id)
      // Unranked items sort to the bottom; authored order breaks ties (stable sort).
      const avg = t && t.n > 0 ? t.sum / t.n : n
      return { id: item.id, label: item.label, avg }
    })
    .sort((a, b) => a.avg - b.avg)
}

export { consensus }
