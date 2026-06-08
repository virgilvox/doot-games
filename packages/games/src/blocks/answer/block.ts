/**
 * Answer block, type-the-answer trivia. Show a prompt (and optional image); every
 * player TYPES a free-text answer instead of picking from options. The accepted
 * answer(s) are withheld until reveal, then graded with the tolerant shared matcher
 * (case/space/punctuation/accent fold, a leading article dropped, and, when `fuzzy`
 * is on, a small typo forgiven). Several accepted answers act as a synonym list
 * ("NYC" / "New York City"). Correct-only scoring: a wrong or missing answer earns
 * nothing, exactly like the multiple-choice Guess block.
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
import { matchAnswer } from '../text-match'
import AnswerHost from './AnswerHost.vue'
import AnswerPlayer from './AnswerPlayer.vue'
import AnswerReveal from './AnswerReveal.vue'

export const answerContentSchema = z.object({
  subject: z.string().default('').describe('Optional label shown on the big screen, e.g. a category.'),
  prompt: promptText('What is the answer?'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  /** Accepted answers; the first is shown as THE answer, the rest are synonyms.
   *  Stripped to [] in the published content (it is the answer key). */
  answers: z
    .array(z.string())
    .min(1)
    .describe('Accepted answers. The first is shown as the answer; add more as synonyms (e.g. "NYC", "New York City").'),
  fuzzy: z
    .boolean()
    .default(true)
    .describe('Forgive small typos and accents. Turn off to require a near-exact match.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(30)
    .describe('Seconds to answer. Turn off for an untimed round.'),
})

export type AnswerContent = z.infer<typeof answerContentSchema>
export interface AnswerInput {
  text: string
}
/** The withheld answer key: the accepted answers, revealed only at reveal. */
export interface AnswerAnswer {
  answers: string[]
}
/** The public reveal payload phones read for personal feedback. `accepted` is public
 *  only now (at reveal), so a phone can grade its own answer with the same matcher. */
export interface AnswerRevealSummary {
  answer: string
  accepted: string[]
  fuzzy: boolean
  marks: Array<{ pid: string; name: string; text: string; correct: boolean }>
  correctCount: number
  total: number
}

/** The accepted-answer list for a round, from its withheld key (host-side). */
function acceptedOf(answer: unknown): string[] {
  const a = (answer as AnswerAnswer | undefined)?.answers
  return Array.isArray(a) ? a : []
}

export const answerBlock = defineBlock<AnswerContent, AnswerInput>({
  kind: 'answer',
  name: 'Answer',
  contentSchema: answerContentSchema,
  defaultContent: () => ({
    subject: '',
    prompt: 'What is the capital of France?',
    image: '',
    answers: ['Paris'],
    fuzzy: true,
    timer: 30,
  }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ text: '' }),
  isComplete: (_c, input) => input.text.trim().length > 0,
  PlayerInput: AnswerPlayer,
  HostDisplay: AnswerHost,
  PlayerReveal: AnswerReveal,
  // The accepted answers ARE the answer key: strip them from the content published
  // at game start so a spectator can't read them from the relay before reveal.
  redactContent: (c) => ({ ...c, answers: [] }),
  answerOf: (c) => ({ answers: c.answers } satisfies AnswerAnswer),

  revealSummary: (ctx: RevealContext<AnswerContent, AnswerInput>): AnswerRevealSummary => {
    const accepted = acceptedOf(ctx.answer)
    const fuzzy = ctx.content.fuzzy
    const nameOf = (pid: string) => ctx.players.find((p) => p.id === pid)?.name ?? 'Someone'
    const marks: AnswerRevealSummary['marks'] = []
    let correctCount = 0
    for (const [pid, input] of ctx.inputs) {
      const text = input?.text?.trim() ?? ''
      if (!text) continue
      const correct = matchAnswer(text, accepted, { fuzzy })
      if (correct) correctCount++
      marks.push({ pid, name: nameOf(pid), text, correct })
    }
    // Correct first, then by name, so the big screen reads cleanly.
    marks.sort((a, b) => Number(b.correct) - Number(a.correct) || a.name.localeCompare(b.name))
    return {
      answer: accepted[0] ?? '',
      accepted,
      fuzzy,
      marks,
      correctCount,
      total: marks.length,
    }
  },

  aggregate: (ctx: BlockResultsContext<AnswerContent, AnswerInput>): ResultsFragment => {
    const tallies = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      correct: 0,
      eligible: 0,
    }))
    for (const { index, content } of ctx.rounds) {
      const accepted = acceptedOf(ctx.answerFor(index))
      const fuzzy = content.fuzzy
      const inputs = ctx.inputsFor(index)
      for (const t of tallies) {
        if (!isEligible(t.joinedAtIndex, index)) continue
        t.eligible++
        const text = inputs.get(t.id)?.text?.trim()
        // Only a correct answer scores. A wrong or missing answer earns nothing.
        if (text && matchAnswer(text, accepted, { fuzzy })) t.correct++
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
        { label: 'Answer rounds', value: ctx.rounds.length },
        { label: 'Top score', value: tallies[0]?.correct ?? 0 },
      ],
    }
  },
})
