/**
 * Rate block, score subjects on categories. The scale is flexible: a numeric
 * range (1–10, stars), or an ordered set of labelled levels (letter grades
 * F→A, tiers D→S, anything). Averaging uses each step's `value`; display uses
 * its `label`. Distinct from Poll (which is a single choice with no scale).
 * Contributes a top-rated award per category.
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import RateHost from './RateHost.vue'
import RatePlayer from './RatePlayer.vue'

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
  prompt: z.string().default('Rate this'),
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
  aggregate: (ctx: BlockResultsContext<RateContent, RateInput>): ResultsFragment => {
    const byCategory = new Map<string, { label: string; subject: string; avg: number; scale: RateScale }>()
    let ratingsCast = 0
    for (const { index, content } of ctx.rounds) {
      const inputs = ctx.inputsFor(index)
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
        if (n > 0) {
          const avg = sum / n
          const prev = byCategory.get(cat.id)
          if (!prev || avg > prev.avg) {
            byCategory.set(cat.id, {
              label: cat.label,
              subject: content.subject || `Round ${index + 1}`,
              avg,
              scale: content.scale,
            })
          }
        }
      }
    }
    const awards = [...byCategory.values()].map((e) => ({
      label: `Top rated ${e.label}`,
      subject: e.subject,
      value: formatScore(e.avg, e.scale),
    }))
    return {
      headline: 'The results are in',
      awards,
      stats: [
        { label: 'Rate rounds', value: ctx.rounds.length },
        { label: 'Ratings cast', value: ratingsCast },
      ],
    }
  },
})
