/**
 * Photo vote ("photovote"), the judge half of a share-and-vote: like the vote block,
 * but the options are PHOTOS shared in the prior `collect` round. Its content is
 * derived at runtime from that round's submissions (the data-URL media carried
 * straight through), anonymized and shuffled into a gallery the room votes on.
 * Authors score by vote share, the same curve as vote/drawvote.
 *
 * No answer key to withhold (a photo has no "correct"), only the option->author map,
 * the withheld key revealed at reveal so the big screen can credit each photo.
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
import { pityPoints, roundMultiplier, sweepBonus, voteSharePoints } from '../scoring'
import { scaleReadTimer } from '../timing'
import PhotoVoteHost from './PhotoVoteHost.vue'
import PhotoVotePlayer from './PhotoVotePlayer.vue'
import PhotoVoteReveal from './PhotoVoteReveal.vue'

export const photoOptionSchema = z.object({ id: z.string(), media: z.string() })
export type PhotoVoteOption = z.infer<typeof photoOptionSchema>

export const photoVoteContentSchema = z.object({
  prompt: promptText('Which photo wins?'),
  options: z.array(photoOptionSchema).default([]),
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
export type PhotoVoteContent = z.infer<typeof photoVoteContentSchema>
export interface PhotoVoteInput {
  choice: string
}
/** The withheld key for a derived photo-vote round: option id -> author pid, plus
 *  names captured at derive time (so a sharer who left is still credited). */
export interface PhotoVoteAnswer {
  authors: Record<string, string>
  names: Record<string, string>
}
export interface PhotoVoteRevealSummary {
  prompt: string
  tallies: Array<{ id: string; media: string; votes: number; author: string }>
  winnerId: string | null
}

function hasMedia(v: unknown): v is { media: string } {
  return !!v && typeof (v as { media?: unknown }).media === 'string' && (v as { media: string }).media.length > 0
}

/** Count votes per option, ignoring self-votes (enforced in the pure tally using the
 *  withheld author map, not just the UI). */
function tally(
  options: Array<{ id: string }>,
  inputs: Map<string, PhotoVoteInput>,
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

export const photoVoteBlock = defineBlock<PhotoVoteContent, PhotoVoteInput>({
  kind: 'photovote',
  name: 'Photo vote',
  contentSchema: photoVoteContentSchema,
  derivedFields: ['options'],
  defaultContent: () => ({ prompt: 'Which photo wins?', options: [], timer: 30, hideUntilReveal: true }),
  defaultTimer: 30,
  timerOf: (c) => scaleReadTimer(c.timer, { images: c.options.length }),
  emptyInput: () => ({ choice: '' }),
  isComplete: (_c, input) => input.choice !== '',
  PlayerInput: PhotoVotePlayer,
  HostDisplay: PhotoVoteHost,
  PlayerReveal: PhotoVoteReveal,

  // Build the anonymized, shuffled photo gallery from the prior collect round.
  derive: (ctx: DeriveContext<PhotoVoteContent>) => {
    const source = ctx.sources[0]
    const sc = source?.content as { prompt?: string } | undefined
    const entries: Array<{ pid: string; media: string }> = []
    if (source) {
      for (const [pid, input] of source.inputs) {
        if (hasMedia(input)) entries.push({ pid, media: input.media })
      }
    }
    const shuffled = ctx.shuffle(entries)
    const options = shuffled.map((e, i) => ({ id: `o${i}`, media: e.media }))
    const authors: Record<string, string> = {}
    const names: Record<string, string> = {}
    shuffled.forEach((e, i) => {
      authors[`o${i}`] = e.pid
      names[e.pid] = ctx.players.find((p) => p.id === e.pid)?.name ?? 'Someone'
    })
    return {
      publish: {
        prompt: sc?.prompt ? `Best photo: "${sc.prompt}"` : ctx.content.prompt,
        options,
        timer: ctx.content.timer,
        hideUntilReveal: ctx.content.hideUntilReveal,
      },
      answer: { authors, names } satisfies PhotoVoteAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<PhotoVoteContent, PhotoVoteInput>): PhotoVoteRevealSummary => {
    const ans = ctx.answer as PhotoVoteAnswer | undefined
    const authors = ans?.authors ?? {}
    const nameOf = (pid: string) => ctx.players.find((p) => p.id === pid)?.name ?? ans?.names?.[pid] ?? 'Someone'
    const counts = tally(ctx.content.options, ctx.inputs, authors)
    const tallies = ctx.content.options.map((o) => ({
      id: o.id,
      media: o.media,
      votes: counts.get(o.id) ?? 0,
      author: nameOf(authors[o.id] ?? ''),
    }))
    tallies.sort((a, b) => b.votes - a.votes)
    return { prompt: ctx.content.prompt, tallies, winnerId: tallies[0]?.votes ? tallies[0].id : null }
  },

  aggregate: (ctx: BlockResultsContext<PhotoVoteContent, PhotoVoteInput>): ResultsFragment => {
    const scores = new Map<string, number>()
    const names = new Map<string, string>()
    for (const round of ctx.rounds) {
      const ans = ctx.answerFor(round.index) as PhotoVoteAnswer | undefined
      if (ans?.names) for (const [pid, n] of Object.entries(ans.names)) names.set(pid, n)
    }
    for (const p of ctx.players) names.set(p.id, p.name)
    const nameOf = (pid: string) => names.get(pid) ?? 'Someone'

    ctx.rounds.forEach((round, ri) => {
      const authors = (ctx.answerFor(round.index) as PhotoVoteAnswer | undefined)?.authors ?? {}
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
      stats: [{ label: 'Photos', value: [...scores.keys()].length }],
    }
  },
})
