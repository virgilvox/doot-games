/**
 * Vote block, the "judge" half of the two-phase loop. Its content is DERIVED at
 * runtime from the prior "make" round's submissions: the host shuffles and
 * anonymizes the answers into vote options (published only when the room reaches
 * this round) and keeps the option->author map as the withheld answer key,
 * revealed at reveal. Players pick the best answer (not their own); authors score
 * by vote share. This is the Quiplash spine.
 *
 * v1 implements `field` mode (pick one favorite among all answers). `head-to-head`
 * (pairwise matchups) is reserved for Circuit Cypher.
 */
import {
  type BlockResultsContext,
  type DeriveContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  z,
} from '@doot-games/sdk'
import { BASE_POINTS, pityPoints, roundMultiplier, sweepBonus, voteSharePoints } from '../scoring'
import VoteHost from './VoteHost.vue'
import VotePlayer from './VotePlayer.vue'
import VoteReveal from './VoteReveal.vue'

export const voteOptionSchema = z.object({ id: z.string(), text: z.string() })
export type VoteOption = z.infer<typeof voteOptionSchema>

export const voteContentSchema = z.object({
  prompt: z
    .string()
    .default('Which answer wins?')
    .describe('Used only if the previous round has no prompt; normally players see "Best answer: <the previous prompt>".'),
  options: z.array(voteOptionSchema).default([]),
  mode: z
    .enum(['field', 'head-to-head'])
    .default('field')
    .describe('field = pick one favorite from everyone\'s answers.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(30)
    .describe('Seconds to vote. Turn off for an untimed round.'),
  perform: z
    .boolean()
    .default(false)
    .describe('Have robots read each answer aloud (a "performance") before the room votes. Powers the rap battle.'),
  hideUntilReveal: z
    .boolean()
    .default(true)
    .describe('Keep where people voted secret until you reveal, for a real reveal moment. Turn off to show a live tally as votes come in.'),
})
export type VoteContent = z.infer<typeof voteContentSchema>
export interface VoteInput {
  choice: string
}
/** The withheld answer key for a derived vote round: option id -> author pid,
 *  plus the author display names captured at derive time so a player who submits
 *  then leaves before the vote is still scored and named (not dropped). */
export interface VoteAnswer {
  authors: Record<string, string>
  names: Record<string, string>
}
/** The public reveal payload phones read for personal feedback. */
export interface VoteRevealSummary {
  prompt: string
  tallies: Array<{ id: string; text: string; votes: number; author: string }>
  winnerId: string | null
}

/**
 * Count votes per option, ignoring self-votes. The player UI hides your own
 * answer, but a tampered client could still publish a vote for it, so we enforce
 * "you can't vote for yourself" here in the pure tally (which can't be bypassed)
 * using the withheld author map. A missing/empty/unknown choice is skipped.
 */
function tally(
  options: VoteOption[],
  inputs: Map<string, VoteInput>,
  authors: Record<string, string>,
): Map<string, number> {
  const counts = new Map<string, number>(options.map((o) => [o.id, 0]))
  for (const [pid, v] of inputs) {
    if (!v?.choice || !counts.has(v.choice)) continue
    if (authors[v.choice] === pid) continue // self-vote: does not count
    counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  }
  return counts
}

export const voteBlock = defineBlock<VoteContent, VoteInput>({
  kind: 'vote',
  name: 'Vote',
  contentSchema: voteContentSchema,
  // The options are built at runtime from the previous round's answers, so the
  // editor hides the `options` field instead of asking for placeholder ids/text.
  derivedFields: ['options'],
  defaultContent: () => ({
    prompt: 'Which answer wins?',
    options: [],
    mode: 'field',
    timer: 30,
    perform: false,
    hideUntilReveal: true,
  }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: '' }),
  isComplete: (_c, input) => input.choice !== '',
  PlayerInput: VotePlayer,
  HostDisplay: VoteHost,
  PlayerReveal: VoteReveal,

  // Build the anonymized, shuffled vote options from the prior round's answers.
  derive: (ctx: DeriveContext<VoteContent>) => {
    const source = ctx.sources[0]
    // Frame the vote with the source's prompt only when that prompt IS the topic
    // (a quip: "A bad name for a boat"). A fill/bars round's prompt is an
    // instruction ("Fill in the blanks", "Drop your bars") and the topic is the
    // story/verse itself, so for those keep the vote round's own authored prompt
    // (e.g. "Funniest story wins", "Vote for the hottest bars"). We detect the
    // structured "make" blocks by their telltale content fields.
    const sc = source?.content as
      | { prompt?: string; template?: unknown; blanks?: unknown; couplets?: unknown }
      | undefined
    const sourceIsTopical = !!sc && !sc.template && !sc.blanks && !sc.couplets
    const sourcePrompt = sourceIsTopical ? sc.prompt : undefined
    const entries: Array<{ pid: string; text: string }> = []
    if (source) {
      for (const [pid, input] of source.inputs) {
        // `render` turns the source submission into votable text (a Quip's text,
        // a Mad Lib's filled story, ...) via the source block's toVoteText.
        const text = source.render(input).trim()
        if (text) entries.push({ pid, text })
      }
    }
    const shuffled = ctx.shuffle(entries)
    const options = shuffled.map((e, i) => ({ id: `o${i}`, text: e.text }))
    const authors: Record<string, string> = {}
    const names: Record<string, string> = {}
    shuffled.forEach((e, i) => {
      authors[`o${i}`] = e.pid
      names[e.pid] = ctx.players.find((p) => p.id === e.pid)?.name ?? 'Someone'
    })
    return {
      publish: {
        prompt: sourcePrompt ? `Best answer: "${sourcePrompt}"` : ctx.content.prompt,
        options,
        mode: ctx.content.mode,
        timer: ctx.content.timer,
        perform: ctx.content.perform,
        // Carry the author's choice so the derived round the relay gets still
        // withholds (or shows) the live tally as authored. Presentation only,
        // not an answer, so it isn't subject to withholding.
        hideUntilReveal: ctx.content.hideUntilReveal,
      },
      answer: { authors, names } satisfies VoteAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<VoteContent, VoteInput>): VoteRevealSummary => {
    const ans = ctx.answer as VoteAnswer | undefined
    const authors = ans?.authors ?? {}
    // Prefer the live roster name, fall back to the name captured at derive time
    // (so an author who has since left is still named, not "Someone").
    const nameOf = (pid: string) =>
      ctx.players.find((p) => p.id === pid)?.name ?? ans?.names?.[pid] ?? 'Someone'
    const counts = tally(ctx.content.options, ctx.inputs, authors)
    const tallies = ctx.content.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: counts.get(o.id) ?? 0,
      author: nameOf(authors[o.id] ?? ''),
    }))
    tallies.sort((a, b) => b.votes - a.votes)
    return { prompt: ctx.content.prompt, tallies, winnerId: tallies[0]?.votes ? tallies[0].id : null }
  },

  aggregate: (ctx: BlockResultsContext<VoteContent, VoteInput>): ResultsFragment => {
    const scores = new Map<string, number>() // pid -> points
    // Resolve names from the captured author maps first, then let live roster
    // names win (current), so departed authors keep a real name.
    const names = new Map<string, string>()
    for (const round of ctx.rounds) {
      const ans = ctx.answerFor(round.index) as VoteAnswer | undefined
      if (ans?.names) for (const [pid, n] of Object.entries(ans.names)) names.set(pid, n)
    }
    for (const p of ctx.players) names.set(p.id, p.name)
    const nameOf = (pid: string) => names.get(pid) ?? 'Someone'
    const bars: Array<{ label: string; count: number; note?: string }> = []
    ctx.rounds.forEach((round, ri) => {
      const authors = (ctx.answerFor(round.index) as VoteAnswer | undefined)?.authors ?? {}
      const inputs = ctx.inputsFor(round.index)
      const counts = tally(round.content.options, inputs, authors)
      const total = [...counts.values()].reduce((a, b) => a + b, 0)
      const mult = roundMultiplier(ri, ctx.rounds.length)
      for (const opt of round.content.options) {
        const pid = authors[opt.id]
        if (!pid) continue
        const votes = counts.get(opt.id) ?? 0
        const pts = (voteSharePoints(votes, total) + sweepBonus(votes, total)) * mult + pityPoints(votes)
        scores.set(pid, (scores.get(pid) ?? 0) + pts)
        bars.push({ label: opt.text, count: votes, note: `${nameOf(pid)} - ${votes} vote${votes === 1 ? '' : 's'}` })
      }
    })
    // Leaderboard from the union of the live roster and everyone who scored, so a
    // contributor who left before the vote still appears (and can't be silently
    // dropped, which would lose their points and miscrown the winner).
    const pids = new Set<string>([...ctx.players.map((p) => p.id), ...scores.keys()])
    const leaderboard = [...pids]
      .map((pid) => ({ id: pid, name: nameOf(pid), score: scores.get(pid) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    bars.sort((a, b) => b.count - a.count)
    return {
      leaderboard,
      distributions: [{ title: 'Best answers', bars: bars.slice(0, 6) }],
      stats: [{ label: 'Answers', value: bars.length }],
    }
  },
})

/** Exposed for the editor/registry; the vote content is normally runtime-derived. */
export { BASE_POINTS as VOTE_BASE_POINTS }
