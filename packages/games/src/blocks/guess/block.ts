/**
 * Guess block — `multiple-choice`. Show a prompt/image, give options, one is
 * correct (withheld until reveal). Contributes a leaderboard of correct guesses.
 */
import { isEligible } from '@doot-games/engine'
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import GuessHost from './GuessHost.vue'
import GuessPlayer from './GuessPlayer.vue'

export const guessOptionSchema = z.object({
  label: z.string().default(''),
  image: z.string().optional(),
})

export const guessContentSchema = z.object({
  subject: z.string().default(''),
  prompt: z.string().default('Who is this?'),
  image: z.string().default(''),
  timer: z.number().int().nonnegative().nullable().default(20),
  options: z.array(guessOptionSchema).min(2),
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
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
    correct: 0,
  }),
  defaultTimer: 20,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: null }),
  isComplete: (_c, input) => input.choice != null,
  PlayerInput: GuessPlayer,
  HostDisplay: GuessHost,
  redactContent: (c) => ({ ...c, correct: -1 }),
  answerOf: (c) => ({ correct: c.correct }),
  aggregate: (ctx: BlockResultsContext<GuessContent, GuessInput>): ResultsFragment => {
    const tallies = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      correct: 0,
      eligible: 0,
    }))
    for (const { index } of ctx.rounds) {
      const correctIndex = (ctx.answerFor(index) as { correct?: number } | undefined)?.correct
      const inputs = ctx.inputsFor(index)
      for (const t of tallies) {
        if (!isEligible(t.joinedAtIndex, index)) continue
        t.eligible++
        const input = inputs.get(t.id)
        if (input && input.choice != null && input.choice === correctIndex) t.correct++
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
