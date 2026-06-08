/**
 * Survey block (Family Feud, authored). A round has a hidden BOARD of ranked
 * answers, each worth points; players name as many as they can, and each board
 * answer they find scores its points. The board is the answer key: stripped from
 * the published content (`redactContent` + `answerOf` + a REDACTION_RULES entry)
 * and revealed only at reveal. Matching uses the shared P1 tolerant matcher.
 * Points-style scoring, so it works with teams + the running standings.
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
import SurveyHost from './SurveyHost.vue'
import SurveyPlayer from './SurveyPlayer.vue'
import SurveyReveal from './SurveyReveal.vue'
import { type SurveyAnswer, type SurveyContent, type SurveyInput, scoreSurvey } from './logic'

export const surveyContentSchema = z.object({
  prompt: promptText('Name a popular pizza topping.'),
  /** The ranked board (highest points first). The answer key: stripped to [] in
   *  the published content and revealed only at reveal. */
  answers: z
    .array(z.object({ text: z.string().min(1), points: z.number().int().nonnegative() }))
    .default([])
    .describe('The top answers and their points (highest first). Hidden until reveal.'),
  guessCount: z
    .number()
    .int()
    .positive()
    .max(8)
    .default(3)
    .describe('How many guesses each player gets.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(45)
    .describe('Seconds to answer. Turn off for an untimed round.'),
})

/** The withheld answer key. */
export interface SurveyAnswerKey {
  answers: SurveyAnswer[]
}
/** The public reveal payload phones read: the board + per-answer find counts. */
export interface SurveyRevealSummary {
  answers: SurveyAnswer[]
  hits: number[]
}

function boardOf(answer: unknown, content: SurveyContent): SurveyAnswer[] {
  const a = (answer as SurveyAnswerKey | undefined)?.answers
  return Array.isArray(a) && a.length ? a : (content.answers ?? [])
}

export const surveyBlock = defineBlock<SurveyContent, SurveyInput>({
  kind: 'survey',
  name: 'Survey',
  contentSchema: surveyContentSchema,
  defaultContent: () => ({
    prompt: 'Name a popular pizza topping.',
    answers: [
      { text: 'Pepperoni', points: 35 },
      { text: 'Cheese', points: 25 },
      { text: 'Mushroom', points: 15 },
      { text: 'Sausage', points: 12 },
      { text: 'Onion', points: 8 },
      { text: 'Pineapple', points: 5 },
    ],
    guessCount: 3,
    timer: 45,
  }),
  defaultTimer: 45,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ guesses: [] }),
  PlayerInput: SurveyPlayer,
  HostDisplay: SurveyHost,
  PlayerReveal: SurveyReveal,
  // The board IS the answer key: strip it from the published config.
  redactContent: (c) => ({ ...c, answers: [] }),
  answerOf: (c) => ({ answers: c.answers } satisfies SurveyAnswerKey),

  revealSummary: (ctx: RevealContext<SurveyContent, SurveyInput>): SurveyRevealSummary => {
    const board = boardOf(ctx.answer, ctx.content)
    return { answers: board, hits: scoreSurvey(board, ctx.inputs as Map<string, SurveyInput>).hits }
  },

  aggregate: (ctx: BlockResultsContext<SurveyContent, SurveyInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex, score: 0 }))
    const byId = new Map(totals.map((t) => [t.id, t]))
    let topAnswer: { prompt: string; text: string } | null = null
    for (const { index, content } of ctx.rounds) {
      const board = boardOf(ctx.answerFor(index), content)
      if (!topAnswer && board[0]) topAnswer = { prompt: content.prompt, text: board[0].text }
      const { scores } = scoreSurvey(board, ctx.inputsFor(index) as Map<string, SurveyInput>)
      for (const [pid, s] of scores) {
        const t = byId.get(pid)
        if (!t || !isEligible(t.joinedAtIndex, index)) continue
        t.score += s
      }
    }
    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      leaderboard: totals.map((t) => ({ id: t.id, name: t.name, score: t.score, detail: `${t.score} pts` })),
      awards: topAnswer ? [{ label: 'Top answer', subject: topAnswer.text, value: topAnswer.prompt }] : [],
      stats: [
        { label: 'Surveys', value: ctx.rounds.length },
        { label: 'Top score', value: totals[0]?.score ?? 0 },
      ],
    }
  },
})
