/**
 * Split block, the "judge" half of Split the Room. Its content is DERIVED from a
 * fill round where each player completed a dividing "Would you ...?" dilemma. The
 * room then votes YES/NO on every (anonymized, shuffled) scenario, and each
 * author scores on how close their scenario splits the room to 50/50 (the
 * inverted objective: you want to divide, not please). Authors don't score from
 * their own vote on their own scenario.
 */
import {
  type BlockResultsContext,
  type DeriveContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  z,
} from '@doot-games/sdk'
import { closenessToHalf, roundMultiplier, splitPoints } from '../scoring'
import SplitHost from './SplitHost.vue'
import SplitPlayer from './SplitPlayer.vue'
import SplitReveal from './SplitReveal.vue'

export const splitScenarioSchema = z.object({ id: z.string(), text: z.string() })
export type SplitScenario = z.infer<typeof splitScenarioSchema>

export const splitContentSchema = z.object({
  prompt: z
    .string()
    .default('Would you? Vote yes or no on each')
    .describe('The instruction shown above the yes/no scenarios.'),
  scenarios: z.array(splitScenarioSchema).default([]),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(40)
    .describe('Seconds to vote on every scenario. Turn off for an untimed round.'),
})
export type SplitContent = z.infer<typeof splitContentSchema>
export interface SplitInput {
  votes: Record<string, 'yes' | 'no'>
}
export interface SplitAnswer {
  authors: Record<string, string>
  names: Record<string, string>
}
export interface SplitRevealSummary {
  prompt: string
  results: Array<{ id: string; text: string; author: string; yes: number; no: number; points: number }>
}

/** Per-scenario yes/no counts, excluding the author's own vote on their scenario. */
function tally(
  scenario: SplitScenario,
  inputs: Map<string, SplitInput>,
  authorPid: string | undefined,
): { yes: number; no: number } {
  let yes = 0
  let no = 0
  for (const [pid, input] of inputs) {
    if (pid === authorPid) continue // the author doesn't score from their own vote
    const v = input?.votes?.[scenario.id]
    if (v === 'yes') yes++
    else if (v === 'no') no++
  }
  return { yes, no }
}

export const splitBlock = defineBlock<SplitContent, SplitInput>({
  kind: 'split',
  name: 'Split',
  contentSchema: splitContentSchema,
  // The scenarios are built at runtime from the previous round's answers, so the
  // editor hides the `scenarios` field instead of asking for placeholder text.
  derivedFields: ['scenarios'],
  defaultContent: () => ({ prompt: 'Would you? Vote yes or no on each', scenarios: [], timer: 40 }),
  defaultTimer: 40,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ votes: {} }),
  // Ready once every scenario has a yes/no (the player answers all, including
  // their own; the author's own answer is dropped from scoring).
  isComplete: (c, input) => c.scenarios.length > 0 && c.scenarios.every((s) => !!input.votes[s.id]),
  PlayerInput: SplitPlayer,
  HostDisplay: SplitHost,
  PlayerReveal: SplitReveal,

  derive: (ctx: DeriveContext<SplitContent>) => {
    const source = ctx.sources[0]
    const entries: Array<{ pid: string; text: string }> = []
    if (source) {
      for (const [pid, input] of source.inputs) {
        const text = source.render(input).trim()
        if (text) entries.push({ pid, text })
      }
    }
    const shuffled = ctx.shuffle(entries)
    const scenarios = shuffled.map((e, i) => ({ id: `s${i}`, text: e.text }))
    const authors: Record<string, string> = {}
    const names: Record<string, string> = {}
    shuffled.forEach((e, i) => {
      authors[`s${i}`] = e.pid
      names[e.pid] = ctx.players.find((p) => p.id === e.pid)?.name ?? 'Someone'
    })
    return {
      publish: { prompt: ctx.content.prompt, scenarios, timer: ctx.content.timer },
      answer: { authors, names } satisfies SplitAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<SplitContent, SplitInput>): SplitRevealSummary => {
    const ans = ctx.answer as SplitAnswer | undefined
    const authors = ans?.authors ?? {}
    const nameOf = (pid: string) =>
      ctx.players.find((p) => p.id === pid)?.name ?? ans?.names?.[pid] ?? 'Someone'
    const results = ctx.content.scenarios.map((s) => {
      const author = authors[s.id]
      const { yes, no } = tally(s, ctx.inputs, author)
      return { id: s.id, text: s.text, author: nameOf(author ?? ''), yes, no, points: splitPoints(yes, yes + no) }
    })
    results.sort((a, b) => b.points - a.points)
    return { prompt: ctx.content.prompt, results }
  },

  aggregate: (ctx: BlockResultsContext<SplitContent, SplitInput>): ResultsFragment => {
    const scores = new Map<string, number>()
    const names = new Map<string, string>()
    for (const round of ctx.rounds) {
      const ans = ctx.answerFor(round.index) as SplitAnswer | undefined
      if (ans?.names) for (const [pid, n] of Object.entries(ans.names)) names.set(pid, n)
    }
    for (const p of ctx.players) names.set(p.id, p.name)
    const nameOf = (pid: string) => names.get(pid) ?? 'Someone'
    const bars: Array<{ label: string; count: number; max: number; display: string; note: string }> = []
    ctx.rounds.forEach((round, ri) => {
      const authors = (ctx.answerFor(round.index) as SplitAnswer | undefined)?.authors ?? {}
      const inputs = ctx.inputsFor(round.index)
      const mult = roundMultiplier(ri, ctx.rounds.length)
      for (const s of round.content.scenarios) {
        const pid = authors[s.id]
        if (!pid) continue
        const { yes, no } = tally(s, inputs, pid)
        const total = yes + no
        const pts = splitPoints(yes, total) * mult
        scores.set(pid, (scores.get(pid) ?? 0) + pts)
        // Show how close to a 50/50 split each scenario landed (closeness %).
        bars.push({
          label: s.text,
          count: Math.round(closenessToHalf(yes, total) * 100),
          max: 100,
          display: total > 0 ? `${yes}/${no}` : 'no votes',
          note: `${nameOf(pid)} - ${pts} pts`,
        })
      }
    })
    const pids = new Set<string>([...ctx.players.map((p) => p.id), ...scores.keys()])
    const leaderboard = [...pids]
      .map((pid) => ({ id: pid, name: nameOf(pid), score: scores.get(pid) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    bars.sort((a, b) => b.count - a.count)
    return {
      leaderboard,
      distributions: [{ title: 'Most divisive', bars: bars.slice(0, 6) }],
      stats: [{ label: 'Scenarios', value: bars.length }],
    }
  },
})
