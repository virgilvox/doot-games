/**
 * Buzzer block: the gameshow trivia round. Multiple choice with one right answer
 * (withheld until the dramatic reveal), a per-question point VALUE (so stakes can
 * escalate), and SPEED: each phone reports how long it took to lock in, so the
 * fastest correct answerer "buzzes in" - they get a bonus and their phone dings.
 *
 * Scoring per question: a correct answer earns the question's `points`, plus up
 * to +50% for speed (faster = more), plus a flat +25% "buzz bonus" for the single
 * first-correct player. Wrong/no answer earns nothing. Answers and the correct
 * index never reach the relay until reveal (see redactContent/answerOf).
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
import BuzzerHost from './BuzzerHost.vue'
import BuzzerPlayer from './BuzzerPlayer.vue'
import BuzzerReveal from './BuzzerReveal.vue'

export const buzzerOptionSchema = z.object({
  label: z.string().default(''),
  sublabel: z
    .string()
    .optional()
    .describe('Optional small print under the answer, e.g. the series a character is from.'),
  image: z.string().optional(),
})

export const buzzerContentSchema = z.object({
  subject: z.string().default('').describe('The round/category name shown on the marquee, e.g. "What, You Didn\'t Know That?".'),
  prompt: promptText('What, you didn\'t know that?'),
  image: z.string().default('').describe('Optional picture/clue shown with the question.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(20)
    .describe('Seconds to lock in. Faster correct answers score more. Turn off for an untimed round.'),
  options: z.array(buzzerOptionSchema).min(2).describe('The answer choices (2-4 works best on the gameshow board).'),
  /** Correct option index; stripped to -1 in the published content. */
  correct: z.number().int().default(0),
  points: z.number().int().positive().default(100).describe('What this question is worth. Raise it each question to escalate the stakes.'),
})
export type BuzzerContent = z.infer<typeof buzzerContentSchema>
export interface BuzzerInput {
  choice: number | null
  /** Milliseconds from the question opening on this phone to locking in. */
  ms: number
}

export interface BuzzerRevealSummary {
  correctIndex: number
  correctLabel: string
  points: number
  /** Votes per option index (revealed only now). */
  counts: number[]
  /** The fastest correct answerer (the buzz-in), or null if nobody got it. */
  firstCorrect: { pid: string; name: string } | null
}

/** Points for one answer: value + up to +50% speed + a +25% buzz bonus if first. */
export function buzzerScore(
  points: number,
  correct: boolean,
  ms: number,
  timerMs: number,
  isFirst: boolean,
): number {
  if (!correct) return 0
  let score = points
  if (timerMs > 0) {
    const fast = Math.max(0, Math.min(1, 1 - ms / timerMs))
    score += Math.round(points * 0.5 * fast)
  }
  if (isFirst) score += Math.round(points * 0.25)
  return score
}

/** The pid of the fastest correct answerer for a round, or null. */
function firstCorrectPid(
  inputs: Map<string, BuzzerInput>,
  correctIndex: number,
): string | null {
  let best: { pid: string; ms: number } | null = null
  for (const [pid, input] of inputs) {
    if (input?.choice !== correctIndex) continue
    const ms = input.ms ?? Number.POSITIVE_INFINITY
    if (!best || ms < best.ms) best = { pid, ms }
  }
  return best?.pid ?? null
}

export const buzzerBlock = defineBlock<BuzzerContent, BuzzerInput>({
  kind: 'buzzer',
  name: 'Buzzer',
  scoring: 'Right answers score, and faster correct buzzes score more.',
  contentSchema: buzzerContentSchema,
  defaultContent: () => ({
    subject: 'What, You Didn\'t Know That?',
    prompt: 'What, you didn\'t know that?',
    image: '',
    timer: 20,
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
    correct: 0,
    points: 100,
  }),
  defaultTimer: 20,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: null, ms: 0 }),
  isComplete: (_c, input) => input.choice != null,
  PlayerInput: BuzzerPlayer,
  HostDisplay: BuzzerHost,
  PlayerReveal: BuzzerReveal,
  redactContent: (c) => ({ ...c, correct: -1 }),
  answerOf: (c) => ({ correct: c.correct }),
  revealSummary: (ctx: RevealContext<BuzzerContent, BuzzerInput>): BuzzerRevealSummary => {
    const correctIndex = (ctx.answer as { correct?: number } | undefined)?.correct ?? -1
    const counts = ctx.content.options.map(() => 0)
    for (const input of ctx.inputs.values()) {
      if (input?.choice != null && input.choice >= 0 && input.choice < counts.length) {
        counts[input.choice]!++
      }
    }
    const firstPid = firstCorrectPid(ctx.inputs, correctIndex)
    const firstCorrect = firstPid
      ? { pid: firstPid, name: ctx.players.find((p) => p.id === firstPid)?.name ?? 'Someone' }
      : null
    return {
      correctIndex,
      correctLabel: ctx.content.options[correctIndex]?.label ?? '',
      points: ctx.content.points,
      counts,
      firstCorrect,
    }
  },
  aggregate: (ctx: BlockResultsContext<BuzzerContent, BuzzerInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      score: 0,
      correct: 0,
    }))
    let buzzes = 0
    for (const { index, content } of ctx.rounds) {
      const correctIndex = (ctx.answerFor(index) as { correct?: number } | undefined)?.correct ?? -1
      const inputs = ctx.inputsFor(index)
      const first = firstCorrectPid(inputs, correctIndex)
      if (first) buzzes++
      const timerMs = (content.timer ?? 0) * 1000
      for (const t of totals) {
        if (!isEligible(t.joinedAtIndex, index)) continue
        const input = inputs.get(t.id)
        // Only a correct answer scores (buzzerScore returns 0 for a wrong answer).
        const isCorrect = !!input && input.choice === correctIndex
        if (isCorrect) t.correct++
        t.score += buzzerScore(content.points, isCorrect, input?.ms ?? 0, timerMs, t.id === first)
      }
    }
    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      headline: totals[0]?.score ? `${totals[0].name} takes the crown` : undefined,
      leaderboard: totals.map((t) => ({ id: t.id, name: t.name, score: t.score, detail: `${t.correct} right` })),
      stats: [
        { label: 'Questions', value: ctx.rounds.length },
        { label: 'Buzz-ins', value: buzzes },
      ],
    }
  },
})
