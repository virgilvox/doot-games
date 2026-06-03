/**
 * Most Likely To block: the options ARE the lobby. The room is shown a prompt
 * ("most likely to get kicked out of the con") and everyone votes for a PLAYER
 * from the roster; the reveal shows who the room picked. The most-nominated player
 * across the game takes the (dubious) crown.
 *
 * Unlike the two-phase `vote` block, the options aren't derived from a prior
 * round, they're the live roster, read by the views from the room and resolved in
 * scoring from `ctx.players`. So there is no withholding and no make round: it is a
 * standalone, roster-driven poll-about-people. Each vote carries the chosen
 * player's display name so a nominee who later leaves is still named, not dropped.
 */
import {
  type BlockResultsContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  promptText,
  z,
} from '@doot-games/sdk'
import MostLikelyHost from './MostLikelyHost.vue'
import MostLikelyPlayer from './MostLikelyPlayer.vue'
import MostLikelyReveal from './MostLikelyReveal.vue'

export const mostLikelyContentSchema = z.object({
  prompt: promptText('Most likely to...'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(20)
    .describe('Seconds to vote. Turn off for an untimed round.'),
})
export type MostLikelyContent = z.infer<typeof mostLikelyContentSchema>
export interface MostLikelyInput {
  /** The chosen player's id. */
  choice: string
  /** The chosen player's display name, captured so a nominee who leaves is still named. */
  name: string
}

export interface MostLikelyRevealSummary {
  tallies: Array<{ pid: string; name: string; votes: number }>
  winnerName: string
}

/** Count nominations per chosen player id; resolve names (roster first, then the
 *  name captured on the vote). Pure. */
function tally(
  inputs: Map<string, MostLikelyInput>,
  rosterName: (pid: string) => string | undefined,
): Map<string, { name: string; votes: number }> {
  const counts = new Map<string, { name: string; votes: number }>()
  for (const v of inputs.values()) {
    if (!v?.choice) continue
    const name = rosterName(v.choice) ?? v.name ?? 'Someone'
    const cur = counts.get(v.choice) ?? { name, votes: 0 }
    cur.name = name
    cur.votes++
    counts.set(v.choice, cur)
  }
  return counts
}

export const mostLikelyBlock = defineBlock<MostLikelyContent, MostLikelyInput>({
  kind: 'mostlikely',
  name: 'Most Likely To',
  contentSchema: mostLikelyContentSchema,
  defaultContent: () => ({ prompt: 'Most likely to...', timer: 20 }),
  defaultTimer: 20,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ choice: '', name: '' }),
  isComplete: (_c, input) => input.choice !== '',
  PlayerInput: MostLikelyPlayer,
  HostDisplay: MostLikelyHost,
  PlayerReveal: MostLikelyReveal,

  revealSummary: (ctx: RevealContext<MostLikelyContent, MostLikelyInput>): MostLikelyRevealSummary => {
    const rosterName = (pid: string) => ctx.players.find((p) => p.id === pid)?.name
    const counts = tally(ctx.inputs, rosterName)
    const tallies = [...counts.entries()]
      .map(([pid, c]) => ({ pid, name: c.name, votes: c.votes }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
    return { tallies, winnerName: tallies[0]?.votes ? tallies[0].name : '' }
  },

  aggregate: (ctx: BlockResultsContext<MostLikelyContent, MostLikelyInput>): ResultsFragment => {
    const received = new Map<string, { name: string; votes: number }>()
    const rosterName = (pid: string) => ctx.players.find((p) => p.id === pid)?.name
    const distributions = ctx.rounds.map(({ index, content }) => {
      const counts = tally(ctx.inputsFor(index) as Map<string, MostLikelyInput>, rosterName)
      for (const [pid, c] of counts) {
        const cur = received.get(pid) ?? { name: c.name, votes: 0 }
        cur.name = c.name
        cur.votes += c.votes
        received.set(pid, cur)
      }
      const bars = [...counts.values()]
        .map((c) => ({ label: c.name, count: c.votes }))
        .sort((a, b) => b.count - a.count)
      return { title: content.prompt, bars }
    })
    // Leaderboard = most-nominated across the game (the dubious crown). Include
    // current players at zero so everyone appears, then anyone who scored.
    const board = new Map<string, { name: string; score: number }>()
    for (const p of ctx.players) board.set(p.id, { name: p.name, score: 0 })
    for (const [pid, c] of received) board.set(pid, { name: c.name, score: c.votes })
    const leaderboard = [...board.entries()]
      .map(([id, b]) => ({ id, name: b.name, score: b.score, detail: `${b.score} nod${b.score === 1 ? '' : 's'}` }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    const top = leaderboard[0]
    return {
      headline: top?.score ? `${top.name} is most likely` : undefined,
      leaderboard,
      distributions,
      stats: [{ label: 'Rounds', value: ctx.rounds.length }],
    }
  },
})
