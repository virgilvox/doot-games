/**
 * Rate block, score subjects on categories. The scale is flexible: a numeric
 * range (1–10, stars), or an ordered set of labelled levels (letter grades
 * F→A, tiers D→S, anything). Averaging uses each step's `value`; display uses
 * its `label`. Distinct from Poll (which is a single choice with no scale).
 * Contributes a top-rated award per category.
 */
import {
  type BlockResultsContext,
  type Distribution,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import RateHost from './RateHost.vue'
import RatePlayer from './RatePlayer.vue'
import RateReveal from './RateReveal.vue'

export const rateScaleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('numeric'),
    min: z.number().int(),
    max: z.number().int(),
    step: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('levels'),
    levels: z.array(z.object({ label: z.string().min(1), value: z.number() })).min(2),
  }),
])
export type RateScale = z.infer<typeof rateScaleSchema>

export const rateContentSchema = z.object({
  subject: z.string().default('').describe('Optional label shown on the big screen, e.g. what is being rated.'),
  prompt: promptText('Rate this'),
  image: z.string().default('').describe('Optional picture of the thing being rated.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null)
    .describe('Seconds to rate. Turn off for an untimed round.'),
  categories: z
    .array(z.object({ id: z.string().min(1).describe('Internal id (auto-filled).'), label: z.string().min(1) }))
    .min(1)
    .describe('One or more things to score, e.g. Taste, Looks, Value.'),
  scale: rateScaleSchema,
})
export type RateContent = z.infer<typeof rateContentSchema>
export interface RateInput {
  ratings: Record<string, number>
}
/** The public per-round reveal phones read to compare their score to the room. */
export interface RateRevealSummary {
  categories: Array<{ id: string; label: string; avg: number; count: number }>
}

/** The ordered `{label, value}` steps for a scale, numeric or labelled levels. */
export function stepsForScale(scale: RateScale): Array<{ label: string; value: number }> {
  if (scale.kind === 'levels') return [...scale.levels].sort((a, b) => a.value - b.value)
  const out: Array<{ label: string; value: number }> = []
  for (let v = scale.min; v <= scale.max; v += scale.step) out.push({ label: String(v), value: v })
  return out
}
export function scaleMin(scale: RateScale): number {
  return stepsForScale(scale)[0]?.value ?? 0
}
export function scaleMax(scale: RateScale): number {
  const steps = stepsForScale(scale)
  return steps[steps.length - 1]?.value ?? 1
}
/**
 * Format an average for display: a number for numeric, the nearest level label
 * for levels. Iterates value-ordered steps and rounds ties up (the more
 * generous award) so the result does not depend on author declaration order.
 */
export function formatScore(avg: number, scale: RateScale): string {
  if (scale.kind === 'numeric') return avg.toFixed(1)
  const steps = stepsForScale(scale)
  let best = steps[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const step of steps) {
    const d = Math.abs(step.value - avg)
    if (d <= bestDist) {
      bestDist = d
      best = step
    }
  }
  return best?.label ?? avg.toFixed(1)
}

export const rateBlock = defineBlock<RateContent, RateInput>({
  kind: 'rate',
  name: 'Rate',
  contentSchema: rateContentSchema,
  defaultContent: () => ({
    subject: '',
    prompt: 'Rate this',
    image: '',
    timer: null,
    categories: [
      { id: 'craft', label: 'Craft' },
      { id: 'style', label: 'Style' },
    ],
    scale: { kind: 'numeric', min: 1, max: 10, step: 1 },
  }),
  defaultTimer: null,
  timerOf: (c) => c.timer,
  // Start empty (the strip shows "-") and require every category to be rated, so
  // an untouched submit does not silently cast the lowest score and skew averages.
  emptyInput: () => ({ ratings: {} }),
  isComplete: (c, input) => c.categories.every((cat) => typeof input.ratings[cat.id] === 'number'),
  PlayerInput: RatePlayer,
  HostDisplay: RateHost,
  PlayerReveal: RateReveal,
  // No right answer to withhold; publish each category's room average so a phone
  // can show "you vs the room" at reveal.
  revealSummary: (ctx: RevealContext<RateContent, RateInput>): RateRevealSummary => ({
    categories: ctx.content.categories.map((cat) => {
      let sum = 0
      let count = 0
      for (const input of ctx.inputs.values()) {
        const v = (input as RateInput | null)?.ratings?.[cat.id]
        if (typeof v === 'number') {
          sum += v
          count++
        }
      }
      return { id: cat.id, label: cat.label, avg: count > 0 ? sum / count : 0, count }
    }),
  }),
  aggregate: (ctx: BlockResultsContext<RateContent, RateInput>): ResultsFragment => {
    // A tie for the top rating is a SHARED crown: keep every subject within an
    // epsilon of the best average per category (not just the first one seen), so
    // the reveal shows everyone who tied, each with its own picture.
    const TIE_EPS = 1e-9
    const byCategory = new Map<
      string,
      { label: string; scale: RateScale; best: number; winners: Array<{ subject: string; image: string }> }
    >()
    let ratingsCast = 0
    for (const { index, content } of ctx.rounds) {
      const inputs = ctx.inputsFor(index)
      // Name the rated thing by its subject, then its prompt, then a round number as
      // a last resort, so the results say what was rated rather than "Round 4".
      const name = content.subject?.trim() || content.prompt?.trim() || `Round ${index + 1}`
      for (const cat of content.categories) {
        let sum = 0
        let n = 0
        for (const input of inputs.values()) {
          const v = input?.ratings?.[cat.id]
          if (typeof v === 'number') {
            sum += v
            n++
          }
        }
        ratingsCast += n
        if (n === 0) continue
        const avg = sum / n
        const entry = { subject: name, image: content.image ?? '' }
        const prev = byCategory.get(cat.id)
        if (!prev) {
          byCategory.set(cat.id, { label: cat.label, scale: content.scale, best: avg, winners: [entry] })
        } else if (avg > prev.best + TIE_EPS) {
          // A clear new best resets the shared crown to this subject.
          prev.best = avg
          prev.winners = [entry]
        } else if (avg >= prev.best - TIE_EPS) {
          // Within epsilon of the best: a tie, so this subject joins the crown.
          prev.winners.push(entry)
        }
      }
    }
    // One award card per winner, so a tie lists every subject (each with its own
    // image) instead of silently dropping all but the first.
    const awards = [...byCategory.values()].flatMap((e) =>
      e.winners.map((w) => ({
        label: `Top rated ${e.label}`,
        subject: w.subject,
        value: formatScore(e.best, e.scale),
        ...(w.image ? { image: w.image } : {}),
      })),
    )

    // Combined-group rankings: for each group the author marked "combine ratings",
    // roll its rate rounds into ONE ranking by overall score (the mean of each
    // round's category averages). This is the "combine the ratings of several
    // rounds into a combined score" view.
    const distributions: Distribution[] = []
    for (const g of ctx.groups ?? []) {
      if (!g.combineRatings) continue
      const groupRounds = ctx.rounds.filter((r) => r.group === g.id)
      if (groupRounds.length < 2) continue
      const scored = groupRounds
        .map(({ index, content }) => {
          const name = content.subject?.trim() || content.prompt?.trim() || `Round ${index + 1}`
          const inputs = ctx.inputsFor(index)
          let catSum = 0
          let catN = 0
          for (const cat of content.categories) {
            let sum = 0
            let n = 0
            for (const input of inputs.values()) {
              const v = input?.ratings?.[cat.id]
              if (typeof v === 'number') {
                sum += v
                n++
              }
            }
            if (n > 0) {
              catSum += sum / n
              catN++
            }
          }
          return { label: name, overall: catN > 0 ? catSum / catN : 0, scale: content.scale }
        })
        .sort((a, b) => b.overall - a.overall)
      const top = scored[0]?.overall ?? 0
      const ceiling = Math.max(...groupRounds.map((r) => scaleMax(r.content.scale)), top)
      distributions.push({
        title: g.name || 'Combined ranking',
        bars: scored.map((s) => ({
          label: s.label,
          count: Math.round(s.overall * 10) / 10,
          max: ceiling,
          display: formatScore(s.overall, s.scale),
          // Mark every subject tied for the top (within epsilon), not just the first.
          correct: top > 0 && s.overall >= top - TIE_EPS,
          note: '',
        })),
      })
    }

    return {
      headline: 'The results are in',
      awards,
      ...(distributions.length ? { distributions } : {}),
      stats: [
        { label: 'Rate rounds', value: ctx.rounds.length },
        { label: 'Ratings cast', value: ratingsCast },
      ],
    }
  },
})
