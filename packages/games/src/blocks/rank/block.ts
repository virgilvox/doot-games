/**
 * Rank block, players order a set of items; the room's choices aggregate into
 * one consensus ranking, shown as an ordered chart. A no-winner, opinion-style
 * mechanic (debates, tier lists, "rank these from best to worst").
 */
import {
  type BlockResultsContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import RankHost from './RankHost.vue'
import RankPlayer from './RankPlayer.vue'
import RankReveal from './RankReveal.vue'

export const rankContentSchema = z.object({
  prompt: promptText('Rank these'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null)
    .describe('Seconds to rank. Turn off for an untimed round.'),
  items: z
    .array(
      z.object({
        id: z.string().min(1).describe('Internal id (auto-filled).'),
        label: z.string().min(1),
        // Named `image` so the auto-generated editor form renders an uploader for it
        // (SchemaField keys off the field name), exactly like a tier item's picture.
        image: z.string().default('').describe('Optional picture for this item.'),
      }),
    )
    .min(2)
    .describe('The things players drag into order (at least two).'),
})
export type RankContent = z.infer<typeof rankContentSchema>
export interface RankInput {
  /** Item ids in the player's chosen order. */
  order: string[]
}
/** The public per-round reveal phones read: the room's consensus order. Each entry
 *  carries its picture (when the author set one) so the phone can show the winner
 *  the same way the big screen does. `image` is omitted when blank, keeping the
 *  published value small. */
export interface RankRevealSummary {
  /** In consensus order, each entry carrying the PLACE the room gave it. The place
   *  has to come from here rather than the row's position, or a tie reads "#1, #2"
   *  on the phone while the big screen reads "#1, #1" for the same result. */
  order: Array<{ id: string; label: string; image?: string; place?: string }>
  /** True when the top place is shared, so no surface crowns one of them. */
  tied?: boolean
}

/** Averages within this of each other are the same place: the room ranked them level,
 *  and floating-point means two genuinely equal averages rarely compare exactly. */
const TIE_EPS = 1e-9

/** Competition place within a consensus order: everything level shares one. */
export function place(ranked: Array<{ avg: number }>, of: { avg: number }): string {
  return `#${1 + ranked.filter((o) => o.avg < of.avg - TIE_EPS).length}`
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
      { id: 'a', label: 'Option A', image: '' },
      { id: 'b', label: 'Option B', image: '' },
      { id: 'c', label: 'Option C', image: '' },
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
  PlayerReveal: RankReveal,
  // No withheld answer; publish the room's consensus order so a phone can show
  // where the player's own ranking landed.
  revealSummary: (ctx: RevealContext<RankContent, RankInput>): RankRevealSummary => {
    const ranked = consensus(ctx.content, ctx.inputs)
    const top = ranked[0]
    return {
      order: ranked.map((r) => ({
        id: r.id,
        label: r.label,
        place: place(ranked, r),
        ...(r.image ? { image: r.image } : {}),
      })),
      tied: !!top && ranked.some((o) => o !== top && o.avg <= top.avg + TIE_EPS),
    }
  },
  aggregate: (ctx: BlockResultsContext<RankContent, RankInput>): ResultsFragment => {
    // Every round contributes the WHOLE order, not just its winner: the results page
    // renders it as a podium (the room's #1 large, with its picture, then the rest of
    // the order below), so nothing the room ranked is hidden.
    // A round nobody answered has no ranking: `consensus` falls back to the AUTHORED
    // order, and presenting that as the room's verdict would crown whichever item the
    // author happened to type first. Skip those rounds entirely (the host screen makes
    // the same call while voting is still open).
    const answered = ctx.rounds.filter(({ index }) => ctx.inputsFor(index).size > 0)
    const distributions = answered.map(({ index, content }) => {
      const ranked = consensus(content, ctx.inputsFor(index))
      const n = content.items.length
      return {
        title: content.prompt,
        layout: 'podium' as const,
        bars: ranked.map((r, rank) => ({
          label: r.label,
          count: n - rank, // #1 gets the fullest bar
          max: n, // fill against item count, not a vote sum
          // Items the room placed level share a place, so a dead heat reads as one
          // ("#1, #1, #3") instead of inventing an order the room never chose. For
          // rank the place IS the bar's value, so `display` and `place` agree.
          display: place(ranked, r),
          place: place(ranked, r),
          note: avgPlaceNote(r.avg, n),
          ...(r.image ? { image: r.image } : {}),
        })),
      }
    })
    // One award per round for the room's #1, so the winner also gets a card of its
    // own (with its picture) on the results highlights page. Only when the author gave
    // that item a picture (a text-only winner already reads fine on the podium) and
    // only when the room's #1 is CLEAR: crowning one of several tied items would be
    // making up a result.
    const awards: NonNullable<ResultsFragment['awards']> = []
    for (const { index, content } of answered) {
      const ranked = consensus(content, ctx.inputsFor(index))
      const top = ranked[0]
      if (!top?.image) continue
      if (ranked.some((o) => o !== top && o.avg <= top.avg + TIE_EPS)) continue // a tie, no single winner
      awards.push({
        label: content.prompt?.trim() || `Round ${index + 1}`,
        subject: top.label,
        value: '#1',
        image: top.image,
      })
    }
    return {
      headline: 'The results are in',
      ...(awards.length ? { awards } : {}),
      distributions,
      stats: [{ label: 'Rank rounds', value: ctx.rounds.length }],
    }
  },
})

/** `consensus` averages a ZERO-based position, which reads as nonsense on screen
 *  ("avg 0.2" for a unanimous winner). Show the average PLACE the room gave it. */
export function avgPlaceNote(avg: number, itemCount?: number): string {
  // `consensus` parks an item nobody placed at `avg = n`, which would print a place
  // one past the end of the list. Say what actually happened instead.
  if (itemCount !== undefined && avg >= itemCount) return 'not ranked'
  return `avg place ${(avg + 1).toFixed(1)}`
}

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
      return { id: item.id, label: item.label, image: item.image ?? '', avg }
    })
    .sort((a, b) => a.avg - b.avg)
}

export { consensus }
