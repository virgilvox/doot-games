/**
 * Fib Finder ("fibvote"), the Fibbage spine: the judge half of a make->judge
 * loop where the make round collects each player's plausible LIE to a trivia
 * question, and this round mixes those lies with the one real answer (the
 * withheld `truth`) into a shuffled list. The room then votes for which one is
 * TRUE. Dual-axis scoring: you earn for finding the truth, and you earn for
 * every player your lie fooled.
 *
 * Like the vote block, the options are DERIVED at runtime from the prior round's
 * inputs and the truth is injected by the host (who alone knows it). The truth is
 * an answer key: it is stripped from the published content (`redactContent` +
 * the API REDACTION_RULES) and which option is true is withheld until reveal.
 */
import {
  type BlockResultsContext,
  type DeriveContext,
  type RevealContext,
  defineBlock,
  z,
} from '@doot-games/sdk'
import { type ResultsFragment } from '@doot-games/sdk'
import { liarPoints, roundMultiplier, truthFinderPoints } from '../scoring'
import { voteOptionSchema } from '../vote/block'
import FibHost from './FibHost.vue'
import FibPlayer from './FibPlayer.vue'
import FibReveal from './FibReveal.vue'

/** A sentinel author id for the injected truth (it has no player author). */
const TRUTH_PID = '__truth__'

/** Normalize an answer for comparison (so a lie that equals the truth is dropped
 *  instead of duplicating the true option, which would split its votes). */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
}

export const fibContentSchema = z.object({
  prompt: z
    .string()
    .default('Which one is TRUE?')
    .describe('Used only if the make round has no prompt; normally players see the trivia question itself.'),
  /** The real answer. Hidden from players, mixed into the options as the one
   *  true choice; stripped to '' in the published content. */
  truth: z.string().default('').describe('The real answer. Mixed in with the lies; players must spot it.'),
  options: z.array(voteOptionSchema).default([]),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(30)
    .describe('Seconds to vote. Turn off for an untimed round.'),
  hideUntilReveal: z
    .boolean()
    .default(true)
    .describe('Keep where people voted secret until you reveal, for a real reveal moment.'),
})
export type FibContent = z.infer<typeof fibContentSchema>
export interface FibInput {
  choice: string
}
/** The withheld answer key for a derived fib round: which option is the truth,
 *  the lie option->author map, and author names captured at derive time. */
export interface FibAnswer {
  truthId: string
  authors: Record<string, string>
  names: Record<string, string>
}
/** The public reveal payload phones read for personal feedback. */
export interface FibRevealSummary {
  prompt: string
  truthId: string
  truthText: string
  options: Array<{ id: string; text: string; votes: number; author: string | null; isTruth: boolean }>
}

/**
 * Count votes per option, ignoring self-votes (you can't vote your own lie). A
 * missing/empty/unknown choice is skipped. The truth has no author, so a vote
 * for it is always counted.
 */
function tally(
  options: Array<{ id: string }>,
  inputs: Map<string, FibInput>,
  authors: Record<string, string>,
): Map<string, number> {
  const counts = new Map<string, number>(options.map((o) => [o.id, 0]))
  for (const [pid, v] of inputs) {
    if (!v?.choice || !counts.has(v.choice)) continue
    if (authors[v.choice] === pid) continue // self-vote on your own lie: ignored
    counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  }
  return counts
}

export const fibBlock = defineBlock<FibContent, FibInput>({
  kind: 'fibvote',
  name: 'Fib vote',
  contentSchema: fibContentSchema,
  derivedFields: ['options'],
  defaultContent: () => ({
    prompt: 'Which one is TRUE?',
    truth: '',
    options: [],
    timer: 30,
    hideUntilReveal: true,
  }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: '' }),
  isComplete: (_c, input) => input.choice !== '',
  PlayerInput: FibPlayer,
  HostDisplay: FibHost,
  PlayerReveal: FibReveal,
  // Strip the truth from the content published at game start (the per-round
  // options are derived later, with the truth mixed in but unmarked).
  redactContent: (c) => ({ ...c, truth: '', options: [] }),

  // Mix the players' lies (from the make round) with the injected truth into a
  // shuffled, anonymized option list; withhold which option is the truth.
  derive: (ctx: DeriveContext<FibContent>) => {
    const source = ctx.sources[0]
    const sc = source?.content as { prompt?: string } | undefined
    const truth = ctx.content.truth.trim()
    const truthKey = norm(truth)
    const entries: Array<{ pid: string; text: string }> = []
    if (source) {
      for (const [pid, input] of source.inputs) {
        const text = source.render(input).trim()
        // Drop a lie that matches the truth, so the true option isn't duplicated
        // (which would split its votes and give the game away).
        if (!text || (truthKey && norm(text) === truthKey)) continue
        entries.push({ pid, text })
      }
    }
    if (truth) entries.push({ pid: TRUTH_PID, text: truth })
    const shuffled = ctx.shuffle(entries)
    const options = shuffled.map((e, i) => ({ id: `o${i}`, text: e.text }))
    const authors: Record<string, string> = {}
    const names: Record<string, string> = {}
    let truthId = ''
    shuffled.forEach((e, i) => {
      const id = `o${i}`
      if (e.pid === TRUTH_PID) {
        truthId = id
      } else {
        authors[id] = e.pid
        names[e.pid] = ctx.players.find((p) => p.id === e.pid)?.name ?? 'Someone'
      }
    })
    return {
      publish: {
        prompt: sc?.prompt || ctx.content.prompt,
        options,
        timer: ctx.content.timer,
        hideUntilReveal: ctx.content.hideUntilReveal,
        truth: '', // never publish the answer
      },
      answer: { truthId, authors, names } satisfies FibAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<FibContent, FibInput>): FibRevealSummary => {
    const ans = ctx.answer as FibAnswer | undefined
    const authors = ans?.authors ?? {}
    const truthId = ans?.truthId ?? ''
    const nameOf = (pid: string) =>
      ctx.players.find((p) => p.id === pid)?.name ?? ans?.names?.[pid] ?? 'Someone'
    const counts = tally(ctx.content.options, ctx.inputs, authors)
    const truthText = ctx.content.options.find((o) => o.id === truthId)?.text ?? ''
    const options = ctx.content.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: counts.get(o.id) ?? 0,
      author: o.id === truthId ? null : nameOf(authors[o.id] ?? ''),
      isTruth: o.id === truthId,
    }))
    options.sort((a, b) => b.votes - a.votes)
    return { prompt: ctx.content.prompt, truthId, truthText, options }
  },

  aggregate: (ctx: BlockResultsContext<FibContent, FibInput>): ResultsFragment => {
    const scores = new Map<string, number>()
    const fooledTotal = new Map<string, number>() // pid -> players fooled (for an award)
    const names = new Map<string, string>()
    for (const round of ctx.rounds) {
      const ans = ctx.answerFor(round.index) as FibAnswer | undefined
      if (ans?.names) for (const [pid, n] of Object.entries(ans.names)) names.set(pid, n)
    }
    for (const p of ctx.players) names.set(p.id, p.name)
    const nameOf = (pid: string) => names.get(pid) ?? 'Someone'
    const bars: Array<{ label: string; count: number; note?: string }> = []

    ctx.rounds.forEach((round, ri) => {
      const ans = ctx.answerFor(round.index) as FibAnswer | undefined
      const authors = ans?.authors ?? {}
      const truthId = ans?.truthId ?? ''
      const inputs = ctx.inputsFor(round.index)
      const counts = tally(round.content.options, inputs, authors)
      const mult = roundMultiplier(ri, ctx.rounds.length)

      // Truth-finders: each voter who picked the true option.
      for (const [pid, v] of inputs) {
        if (v?.choice && truthId && v.choice === truthId) {
          scores.set(pid, (scores.get(pid) ?? 0) + truthFinderPoints(true) * mult)
        }
      }
      // Liars: each lie's author earns for every (non-self) vote it drew.
      for (const opt of round.content.options) {
        const pid = authors[opt.id]
        if (!pid) continue // the truth option has no author
        const fooled = counts.get(opt.id) ?? 0
        if (fooled > 0) {
          scores.set(pid, (scores.get(pid) ?? 0) + liarPoints(fooled) * mult)
          fooledTotal.set(pid, (fooledTotal.get(pid) ?? 0) + fooled)
        }
      }
      // A distribution row per round: the true answer and how many found it.
      const found = truthId ? (counts.get(truthId) ?? 0) : 0
      const truthText = round.content.options.find((o) => o.id === truthId)?.text ?? '(no answer)'
      bars.push({ label: truthText, count: found, note: `The truth - ${found} found it` })
    })

    const pids = new Set<string>([...ctx.players.map((p) => p.id), ...scores.keys()])
    const leaderboard = [...pids]
      .map((pid) => ({ id: pid, name: nameOf(pid), score: scores.get(pid) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

    // Award the biggest fibber (most players fooled across the game).
    const topLiar = [...fooledTotal.entries()].sort((a, b) => b[1] - a[1])[0]
    const awards = topLiar && topLiar[1] > 0
      ? [{ label: 'Best fibber', subject: nameOf(topLiar[0]), value: `fooled ${topLiar[1]}` }]
      : []

    return {
      leaderboard,
      awards,
      distributions: [{ title: 'The truth, and who found it', bars }],
      stats: [{ label: 'Questions', value: ctx.rounds.length }],
    }
  },
})
