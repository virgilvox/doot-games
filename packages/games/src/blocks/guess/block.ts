/**
 * Guess block, `multiple-choice`. Show a prompt/image, give options, one is
 * correct (withheld until reveal). Contributes a leaderboard of correct guesses.
 */
import { isEligible } from '@doot-games/engine'
import {
  type BlockResultsContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  z,
} from '@doot-games/sdk'
import GuessHost from './GuessHost.vue'
import GuessPlayer from './GuessPlayer.vue'
import GuessReveal from './GuessReveal.vue'

export const guessOptionSchema = z.object({
  label: z.string().default(''),
  sublabel: z
    .string()
    .optional()
    .describe('Optional small print under the answer, e.g. the series a character is from.'),
  image: z.string().optional(),
})

export const guessContentSchema = z.object({
  subject: z.string().default('').describe('Optional label shown on the big screen, e.g. a category.'),
  prompt: z.string().default('Who is this?'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(20)
    .describe('Seconds to answer. Turn off for an untimed round.'),
  hideUntilReveal: z
    .boolean()
    .default(true)
    .describe('Keep where people answered secret until you reveal, for a real reveal moment. Turn off to show a live tally as answers come in.'),
  pointsForAnswering: z
    .boolean()
    .default(false)
    .describe('Relaxed mode: give everyone who answers the point, win or lose. Turn off for a normal quiz where only correct answers score.'),
  options: z.array(guessOptionSchema).min(2).describe('At least two answers to choose from.'),
  /** Correct option index; stripped to -1 in the published content. */
  correct: z.number().int().default(0),
})

export type GuessContent = z.infer<typeof guessContentSchema>
export interface GuessInput {
  choice: number | null
}

export const guessBlock = defineBlock<GuessContent, GuessInput>({
  kind: 'guess',
  name: 'Guess',
  contentSchema: guessContentSchema,
  defaultContent: () => ({
    subject: '',
    prompt: 'Who is this?',
    image: '',
    timer: 20,
    hideUntilReveal: true,
    pointsForAnswering: false,
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
    correct: 0,
  }),
  defaultTimer: 20,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: null }),
  isComplete: (_c, input) => input.choice != null,
  PlayerInput: GuessPlayer,
  HostDisplay: GuessHost,
  PlayerReveal: GuessReveal,
  redactContent: (c) => ({ ...c, correct: -1 }),
  answerOf: (c) => ({ correct: c.correct }),
  // Public per-round reveal so phones can show right/wrong feedback. The correct
  // answer is only meant to be secret BEFORE reveal; publishing it now is fine.
  revealSummary: (ctx: RevealContext<GuessContent, GuessInput>) => {
    const correctIndex = (ctx.answer as { correct?: number } | undefined)?.correct ?? -1
    return {
      correctIndex,
      correctLabel: ctx.content.options[correctIndex]?.label ?? '',
    }
  },
  aggregate: (ctx: BlockResultsContext<GuessContent, GuessInput>): ResultsFragment => {
    const tallies = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      correct: 0,
      eligible: 0,
    }))
    for (const { index, content } of ctx.rounds) {
      const correctIndex = (ctx.answerFor(index) as { correct?: number } | undefined)?.correct
      // Relaxed/participation mode: anyone who answered earns the point.
      const scoreAll = content.pointsForAnswering
      const inputs = ctx.inputsFor(index)
      for (const t of tallies) {
        if (!isEligible(t.joinedAtIndex, index)) continue
        t.eligible++
        const input = inputs.get(t.id)
        const answered = input != null && input.choice != null
        if (answered && (scoreAll || input.choice === correctIndex)) t.correct++
      }
    }
    tallies.sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name))
    return {
      leaderboard: tallies.map((t) => ({
        id: t.id,
        name: t.name,
        score: t.correct,
        detail: `${t.correct} / ${t.eligible}`,
      })),
      stats: [
        { label: 'Guess rounds', value: ctx.rounds.length },
        { label: 'Top score', value: tallies[0]?.correct ?? 0 },
      ],
    }
  },
})
