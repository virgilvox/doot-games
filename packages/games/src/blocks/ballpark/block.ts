/**
 * Ballpark block: numeric "closest guess wins" trivia. Show a question with a
 * single numeric answer (withheld until reveal); each phone types a number; the
 * closest guess scores the most. The reveal animates a needle to the true answer
 * with everyone's guesses marked along the dial.
 *
 * Scoring is self-scaling (no per-question difficulty knob): within a round, the
 * worst guess earns nothing and the rest earn by how close they are to it, with a
 * flat bullseye bonus to the single closest. So "how many ridges on a quarter?"
 * and "how far is the moon in km?" both score sensibly without tuning.
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
import { BASE_POINTS, roundMultiplier } from '../scoring'
import BallparkHost from './BallparkHost.vue'
import BallparkPlayer from './BallparkPlayer.vue'
import BallparkReveal from './BallparkReveal.vue'

/** A flat reward for the single closest guess, on top of the closeness curve, so
 *  the closest player clearly wins the round even in a tight pack. */
export const CLOSEST_BONUS = 250

export const ballparkContentSchema = z.object({
  subject: z.string().default('').describe('Optional category shown on the big screen.'),
  prompt: promptText('How many?'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  unit: z.string().default('').describe('Optional unit shown after the number, e.g. "km", "%", "years".'),
  answer: z
    .number()
    .nullable()
    .default(0)
    .describe('The true number. Hidden from players until the reveal.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(30)
    .describe('Seconds to guess. Turn off for an untimed round.'),
})
export type BallparkContent = z.infer<typeof ballparkContentSchema>
export interface BallparkInput {
  value: number | null
}

export interface BallparkMark {
  pid: string
  name: string
  value: number
}
export interface BallparkRevealSummary {
  answer: number | null
  unit: string
  marks: BallparkMark[]
  closestPid: string | null
  /** Dial bounds (min/max across the answer and all guesses, lightly padded). */
  lo: number
  hi: number
}

/** Closeness in [0,1]: 1 when this is the closest (smallest error), 0 for the
 *  worst guess in the round. `maxError <= 0` means everyone nailed it -> full. */
export function ballparkCloseness(error: number, maxError: number): number {
  if (maxError <= 0) return 1
  return Math.max(0, (maxError - error) / maxError)
}

/** Answered guesses for a round (value present), paired with their error. */
function errorsOf(
  inputs: Map<string, BallparkInput>,
  answer: number,
): Array<{ pid: string; value: number; error: number }> {
  const out: Array<{ pid: string; value: number; error: number }> = []
  for (const [pid, input] of inputs) {
    const v = input?.value
    if (v == null || !Number.isFinite(v)) continue
    out.push({ pid, value: v, error: Math.abs(v - answer) })
  }
  return out
}

/**
 * Outlier-robust dial bounds centered on the answer. A single wild guess
 * (someone types 999999) would otherwise blow out the scale and squash everyone
 * else into a sliver, ruining the needle reveal. So the dial radius spans the
 * TYPICAL guess (5x the median error), capped at the actual worst guess: a tight
 * pack stays tight, while a lone absurd guess can't expand the dial (its mark
 * clamps to the track edge, which the host view does via [0,100]% positions).
 * Pure and testable.
 */
export function ballparkBounds(answer: number, values: number[]): { lo: number; hi: number } {
  if (!values.length) {
    const pad = Math.abs(answer) > 0 ? Math.abs(answer) * 0.5 : 1
    return { lo: answer - pad, hi: answer + pad }
  }
  const errors = values.map((v) => Math.abs(v - answer)).sort((a, b) => a - b)
  const n = errors.length
  const maxErr = errors[n - 1] ?? 0
  const median = n % 2 ? (errors[(n - 1) / 2] ?? 0) : ((errors[n / 2 - 1] ?? 0) + (errors[n / 2] ?? 0)) / 2
  let radius = Math.min(maxErr, Math.max(median * 5, errors[0] ?? 0))
  if (radius <= 0) radius = Math.abs(answer) > 0 ? Math.abs(answer) * 0.5 : 1 // everyone nailed it
  const pad = radius * 0.15
  return { lo: answer - radius - pad, hi: answer + radius + pad }
}

export const ballparkBlock = defineBlock<BallparkContent, BallparkInput>({
  kind: 'ballpark',
  name: 'Ballpark',
  contentSchema: ballparkContentSchema,
  defaultContent: () => ({ subject: '', prompt: 'How many?', image: '', unit: '', answer: 0, timer: 30 }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ value: null }),
  isComplete: (_c, input) => input.value != null && Number.isFinite(input.value),
  PlayerInput: BallparkPlayer,
  HostDisplay: BallparkHost,
  PlayerReveal: BallparkReveal,
  redactContent: (c) => ({ ...c, answer: null }),
  answerOf: (c) => ({ answer: c.answer }),

  revealSummary: (ctx: RevealContext<BallparkContent, BallparkInput>): BallparkRevealSummary => {
    const answer = (ctx.answer as { answer?: number | null } | undefined)?.answer ?? null
    const nameOf = (pid: string) => ctx.players.find((p) => p.id === pid)?.name ?? 'Someone'
    if (answer == null) {
      return { answer: null, unit: ctx.content.unit, marks: [], closestPid: null, lo: 0, hi: 1 }
    }
    const errs = errorsOf(ctx.inputs, answer)
    const minErr = errs.length ? Math.min(...errs.map((e) => e.error)) : 0
    const closest = errs.find((e) => e.error === minErr)
    const { lo, hi } = ballparkBounds(answer, errs.map((e) => e.value))
    return {
      answer,
      unit: ctx.content.unit,
      marks: errs
        .map((e) => ({ pid: e.pid, name: nameOf(e.pid), value: e.value }))
        .sort((a, b) => a.value - b.value),
      closestPid: errs.length ? (closest?.pid ?? null) : null,
      lo,
      hi,
    }
  },

  aggregate: (ctx: BlockResultsContext<BallparkContent, BallparkInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      score: 0,
      bullseyes: 0,
    }))
    const byId = new Map(totals.map((t) => [t.id, t]))
    ctx.rounds.forEach(({ index }, ri) => {
      const answer = (ctx.answerFor(index) as { answer?: number | null } | undefined)?.answer
      if (answer == null) return
      const inputs = ctx.inputsFor(index) as Map<string, BallparkInput>
      const errs = errorsOf(inputs, answer).filter((e) => {
        const t = byId.get(e.pid)
        return t && isEligible(t.joinedAtIndex, index)
      })
      if (!errs.length) return
      const maxErr = Math.max(...errs.map((e) => e.error))
      const minErr = Math.min(...errs.map((e) => e.error))
      const mult = roundMultiplier(ri, ctx.rounds.length)
      for (const e of errs) {
        const t = byId.get(e.pid)
        if (!t) continue
        let pts = Math.round(BASE_POINTS * ballparkCloseness(e.error, maxErr))
        if (e.error === minErr) {
          pts += CLOSEST_BONUS
          t.bullseyes++
        }
        t.score += pts * mult
      }
    })
    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      headline: totals[0]?.score ? `${totals[0].name} has the best eye` : undefined,
      leaderboard: totals.map((t) => ({
        id: t.id,
        name: t.name,
        score: t.score,
        detail: `${t.bullseyes} closest`,
      })),
      stats: [
        { label: 'Questions', value: ctx.rounds.length },
        { label: 'Top score', value: totals[0]?.score ?? 0 },
      ],
    }
  },
})
