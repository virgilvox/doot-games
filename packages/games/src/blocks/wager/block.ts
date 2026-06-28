/**
 * Wager block, high-stakes trivia. Each round is a multiple-choice question, but
 * before you lock an answer you BET a tier of points on it: a correct answer adds
 * your bet, a wrong one subtracts it. Everyone starts from a base bankroll; the
 * richest wins. The correct option is withheld until reveal (redactContent +
 * answerOf + a REDACTION_RULES entry), exactly like Guess.
 *
 * Bets are fixed tiers (not a fraction of your live total): keeping the bet off the
 * live standing makes this a clean standalone block (no engine change). The
 * fraction-of-bankroll variant needs per-player content seeded by the standings.
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
import { guessOptionSchema } from '../guess/block'
import WagerHost from './WagerHost.vue'
import WagerPlayer from './WagerPlayer.vue'
import WagerReveal from './WagerReveal.vue'

/** The bet tiers a player can stake on a question. */
export const BET_TIERS = [100, 300, 500] as const
/** Everyone starts here; a round's win/loss moves it. */
export const BASE_BANKROLL = 1000

export const wagerContentSchema = z.object({
  subject: z.string().default('').describe('Optional label shown on the big screen, e.g. a category.'),
  prompt: promptText('Bet on it: which is true?'),
  image: z.string().default('').describe('Optional picture shown with the question.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(25)
    .describe('Seconds to bet + answer. Turn off for an untimed round.'),
  options: z.array(guessOptionSchema).min(2).describe('At least two answers to choose from.'),
  /** Correct option index; stripped to -1 in the published content. */
  correct: z.number().int().default(0),
})

export type WagerContent = z.infer<typeof wagerContentSchema>
export interface WagerInput {
  bet: number
  choice: number | null
}
export interface WagerRevealSummary {
  correctIndex: number
  correctLabel: string
}

/** A valid tier, or the middle tier if the value was tampered with. */
function cleanBet(bet: unknown): number {
  return (BET_TIERS as readonly number[]).includes(bet as number) ? (bet as number) : 300
}

export const wagerBlock = defineBlock<WagerContent, WagerInput>({
  kind: 'wager',
  name: 'Wager',
  scoring: 'Bet points each round; a correct pick wins your stake, a wrong one loses it.',
  contentSchema: wagerContentSchema,
  defaultContent: () => ({
    subject: '',
    prompt: 'Bet on it: which is true?',
    image: '',
    timer: 25,
    options: [{ label: 'Option A' }, { label: 'Option B' }, { label: 'Option C' }, { label: 'Option D' }],
    correct: 0,
  }),
  defaultTimer: 25,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ bet: 300, choice: null }),
  isComplete: (_c, input) => input.choice != null,
  PlayerInput: WagerPlayer,
  HostDisplay: WagerHost,
  PlayerReveal: WagerReveal,
  redactContent: (c) => ({ ...c, correct: -1 }),
  answerOf: (c) => ({ correct: c.correct }),
  revealSummary: (ctx: RevealContext<WagerContent, WagerInput>): WagerRevealSummary => {
    const correctIndex = (ctx.answer as { correct?: number } | undefined)?.correct ?? -1
    return { correctIndex, correctLabel: ctx.content.options[correctIndex]?.label ?? '' }
  },
  aggregate: (ctx: BlockResultsContext<WagerContent, WagerInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex, net: 0 }))
    for (const { index } of ctx.rounds) {
      const correctIndex = (ctx.answerFor(index) as { correct?: number } | undefined)?.correct
      const inputs = ctx.inputsFor(index)
      for (const t of totals) {
        if (!isEligible(t.joinedAtIndex, index)) continue
        const inp = inputs.get(t.id)
        if (!inp || inp.choice == null) continue // no answer -> no bet moves
        const bet = cleanBet(inp.bet)
        t.net += inp.choice === correctIndex ? bet : -bet
      }
    }
    // Bankroll = base + net winnings, never below zero. Order-independent.
    const board = totals
      .map((t) => ({ id: t.id, name: t.name, score: Math.max(0, BASE_BANKROLL + t.net), net: t.net }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    const topGain = [...board].sort((a, b) => b.net - a.net)[0]
    return {
      leaderboard: board.map((b) => ({ id: b.id, name: b.name, score: b.score, detail: `${b.score} bankroll` })),
      awards: topGain && topGain.net > 0 ? [{ label: 'High roller', subject: topGain.name, value: `+${topGain.net}` }] : [],
      stats: [
        { label: 'Questions', value: ctx.rounds.length },
        { label: 'Richest', value: board[0]?.score ?? BASE_BANKROLL },
      ],
    }
  },
})
