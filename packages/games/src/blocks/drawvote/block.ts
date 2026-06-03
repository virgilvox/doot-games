/**
 * Draw vote ("drawvote"), the judge half of Sketch & Spot: like the vote block,
 * but the options are DRAWINGS rather than text. Its content is derived at
 * runtime from the prior draw round's submissions (the normalized stroke data
 * carried straight through, not rendered to text), anonymized and shuffled into
 * a gallery the room votes on. Authors score by vote share, same curve as vote.
 *
 * No answer key to withhold (a drawing has no "correct"), only the option->author
 * map, which is the withheld key revealed at reveal (so the big screen can
 * credit each sketch to its artist).
 */
import {
  type BlockResultsContext,
  type DeriveContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import type { DrawValue } from '@doot-games/ui'
import { BASE_POINTS, pityPoints, roundMultiplier, sweepBonus, voteSharePoints } from '../scoring'
import DrawVoteHost from './DrawVoteHost.vue'
import DrawVotePlayer from './DrawVotePlayer.vue'
import DrawVoteReveal from './DrawVoteReveal.vue'

export const drawOptionSchema = z.object({ id: z.string(), drawing: z.custom<DrawValue>() })
export type DrawVoteOption = z.infer<typeof drawOptionSchema>

export const drawVoteContentSchema = z.object({
  prompt: promptText('Which drawing wins?'),
  options: z.array(drawOptionSchema).default([]),
  aspect: z.number().positive().default(0.7).describe('Drawing shape (height / width), matched to the draw round.'),
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
export type DrawVoteContent = z.infer<typeof drawVoteContentSchema>
export interface DrawVoteInput {
  choice: string
}
/** The withheld key for a derived draw-vote round: option id -> author pid, plus
 *  names captured at derive time (so an artist who left is still credited). */
export interface DrawVoteAnswer {
  authors: Record<string, string>
  names: Record<string, string>
}
export interface DrawVoteRevealSummary {
  prompt: string
  tallies: Array<{ id: string; drawing: DrawValue; votes: number; author: string }>
  winnerId: string | null
}

function hasStrokes(v: unknown): v is DrawValue {
  return !!v && Array.isArray((v as DrawValue).strokes) && (v as DrawValue).strokes.length > 0
}

/** Count votes per option, ignoring self-votes (enforced in the pure tally, not
 *  just the UI, using the withheld author map). */
function tally(
  options: Array<{ id: string }>,
  inputs: Map<string, DrawVoteInput>,
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

export const drawVoteBlock = defineBlock<DrawVoteContent, DrawVoteInput>({
  kind: 'drawvote',
  name: 'Draw vote',
  contentSchema: drawVoteContentSchema,
  derivedFields: ['options'],
  defaultContent: () => ({
    prompt: 'Which drawing wins?',
    options: [],
    aspect: 0.7,
    timer: 30,
    hideUntilReveal: true,
  }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: '' }),
  isComplete: (_c, input) => input.choice !== '',
  PlayerInput: DrawVotePlayer,
  HostDisplay: DrawVoteHost,
  PlayerReveal: DrawVoteReveal,

  // Build the anonymized, shuffled drawing gallery from the prior draw round.
  derive: (ctx: DeriveContext<DrawVoteContent>) => {
    const source = ctx.sources[0]
    const sc = source?.content as { prompt?: string; aspect?: number } | undefined
    const entries: Array<{ pid: string; drawing: DrawValue }> = []
    if (source) {
      // Read the raw stroke inputs directly (a drawing can't render to text).
      for (const [pid, input] of source.inputs) {
        if (hasStrokes(input)) entries.push({ pid, drawing: input })
      }
    }
    const shuffled = ctx.shuffle(entries)
    const options = shuffled.map((e, i) => ({ id: `o${i}`, drawing: e.drawing }))
    const authors: Record<string, string> = {}
    const names: Record<string, string> = {}
    shuffled.forEach((e, i) => {
      authors[`o${i}`] = e.pid
      names[e.pid] = ctx.players.find((p) => p.id === e.pid)?.name ?? 'Someone'
    })
    return {
      publish: {
        prompt: sc?.prompt ? `Best drawing: "${sc.prompt}"` : ctx.content.prompt,
        options,
        aspect: sc?.aspect ?? ctx.content.aspect,
        timer: ctx.content.timer,
        hideUntilReveal: ctx.content.hideUntilReveal,
      },
      answer: { authors, names } satisfies DrawVoteAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<DrawVoteContent, DrawVoteInput>): DrawVoteRevealSummary => {
    const ans = ctx.answer as DrawVoteAnswer | undefined
    const authors = ans?.authors ?? {}
    const nameOf = (pid: string) =>
      ctx.players.find((p) => p.id === pid)?.name ?? ans?.names?.[pid] ?? 'Someone'
    const counts = tally(ctx.content.options, ctx.inputs, authors)
    const tallies = ctx.content.options.map((o) => ({
      id: o.id,
      drawing: o.drawing,
      votes: counts.get(o.id) ?? 0,
      author: nameOf(authors[o.id] ?? ''),
    }))
    tallies.sort((a, b) => b.votes - a.votes)
    return { prompt: ctx.content.prompt, tallies, winnerId: tallies[0]?.votes ? tallies[0].id : null }
  },

  aggregate: (ctx: BlockResultsContext<DrawVoteContent, DrawVoteInput>): ResultsFragment => {
    const scores = new Map<string, number>()
    const names = new Map<string, string>()
    for (const round of ctx.rounds) {
      const ans = ctx.answerFor(round.index) as DrawVoteAnswer | undefined
      if (ans?.names) for (const [pid, n] of Object.entries(ans.names)) names.set(pid, n)
    }
    for (const p of ctx.players) names.set(p.id, p.name)
    const nameOf = (pid: string) => names.get(pid) ?? 'Someone'

    ctx.rounds.forEach((round, ri) => {
      const authors = (ctx.answerFor(round.index) as DrawVoteAnswer | undefined)?.authors ?? {}
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
      }
    })

    const pids = new Set<string>([...ctx.players.map((p) => p.id), ...scores.keys()])
    const leaderboard = [...pids]
      .map((pid) => ({ id: pid, name: nameOf(pid), score: scores.get(pid) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return {
      leaderboard,
      stats: [{ label: 'Drawings', value: [...scores.keys()].length }],
    }
  },
})

export { BASE_POINTS as DRAWVOTE_BASE_POINTS }
