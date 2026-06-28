/**
 * Hivemind block, the "read the room" round. Everyone answers the same open
 * prompt in free text; there is NO right answer. You score by MATCHING the crowd:
 * the more other players gave the same answer as you, the more you earn. A lone,
 * clever answer scores nothing; thinking like everyone else is the whole game.
 *
 * Answers are clustered by a normalized form (case/spacing/punctuation-insensitive,
 * leading articles dropped) so "the beach" and "Beach" land together. Pure and
 * testable; the reveal shows the emergent clusters, biggest first ("the hive said…").
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
import { BASE_POINTS } from '../scoring'
import { normalizeAnswer } from '../text-match'
import HivemindHost from './HivemindHost.vue'
import HivemindPlayer from './HivemindPlayer.vue'
import HivemindReveal from './HivemindReveal.vue'

export const hivemindContentSchema = z.object({
  prompt: promptText('Name something you find in a kitchen.'),
  placeholder: z.string().default('').describe('Greyed-out hint text inside the empty answer box.'),
  maxLength: z.number().int().positive().max(120).default(40).describe('Max characters in an answer.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(30)
    .describe('Seconds to answer. Turn off for an untimed round.'),
})
export type HivemindContent = z.infer<typeof hivemindContentSchema>
export interface HivemindInput {
  text: string
}

/** A cluster of identical (normalized) answers and who gave them. */
export interface HiveCluster {
  /** The normalized key the answers share. */
  key: string
  /** A representative display answer (the first one given, verbatim). */
  label: string
  /** Player ids who gave an answer in this cluster. */
  pids: string[]
}

export interface HivemindRevealSummary {
  clusters: Array<{ label: string; count: number }>
  /** The largest cluster's label (the hive mind's answer), or '' if none. */
  topLabel: string
  /** Per-player: the size of the cluster they landed in (0 if they didn't answer). */
  clusterSizeOf: Record<string, number>
}

/** Re-exported from the shared `text-match` primitive (the canonical aggressive
 *  fold). Kept exported here so `HivemindReveal.vue` and the hivemind tests, which
 *  import it from this module, are unaffected. */
export { normalizeAnswer }

/** Cluster a round's inputs by normalized answer. Order: largest first, then by
 *  first appearance, so the reveal is deterministic. Empty answers are dropped. */
export function clusterAnswers(inputs: Map<string, HivemindInput>): HiveCluster[] {
  const byKey = new Map<string, HiveCluster>()
  for (const [pid, input] of inputs) {
    const text = input?.text?.trim()
    if (!text) continue
    const key = normalizeAnswer(text)
    if (!key) continue
    const existing = byKey.get(key)
    if (existing) existing.pids.push(pid)
    else byKey.set(key, { key, label: text, pids: [pid] })
  }
  return [...byKey.values()].sort((a, b) => b.pids.length - a.pids.length)
}

/**
 * Share of the crowd a cluster of size `k` captured among `total` answers, mapped
 * so a lone answer (k=1) earns nothing and unanimity earns full points:
 * `(k-1)/(total-1)`. Solo play (total<=1) trivially "matches" and earns full.
 */
export function hivemindShare(k: number, total: number): number {
  if (total <= 1) return 1
  return Math.max(0, (k - 1) / (total - 1))
}

export const hivemindBlock = defineBlock<HivemindContent, HivemindInput>({
  kind: 'hivemind',
  name: 'Hivemind',
  scoring: 'Score by matching the most popular answer in the room.',
  contentSchema: hivemindContentSchema,
  defaultContent: () => ({
    prompt: 'Name something you find in a kitchen.',
    placeholder: '',
    maxLength: 40,
    timer: 30,
  }),
  defaultTimer: 30,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ text: '' }),
  isComplete: (_c, input) => input.text.trim().length > 0,
  PlayerInput: HivemindPlayer,
  HostDisplay: HivemindHost,
  PlayerReveal: HivemindReveal,

  revealSummary: (ctx: RevealContext<HivemindContent, HivemindInput>): HivemindRevealSummary => {
    const clusters = clusterAnswers(ctx.inputs)
    const clusterSizeOf: Record<string, number> = {}
    for (const c of clusters) for (const pid of c.pids) clusterSizeOf[pid] = c.pids.length
    return {
      clusters: clusters.map((c) => ({ label: c.label, count: c.pids.length })),
      topLabel: clusters[0]?.label ?? '',
      clusterSizeOf,
    }
  },

  aggregate: (ctx: BlockResultsContext<HivemindContent, HivemindInput>): ResultsFragment => {
    const totals = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAtIndex: p.joinedAtIndex,
      score: 0,
      hits: 0,
    }))
    const byId = new Map(totals.map((t) => [t.id, t]))
    const bars: Array<{ label: string; count: number; note?: string }> = []
    for (const { index, content } of ctx.rounds) {
      const inputs = ctx.inputsFor(index) as Map<string, HivemindInput>
      const clusters = clusterAnswers(inputs)
      const total = clusters.reduce((n, c) => n + c.pids.length, 0)
      for (const c of clusters) {
        const pts = Math.round(BASE_POINTS * hivemindShare(c.pids.length, total))
        for (const pid of c.pids) {
          const t = byId.get(pid)
          if (!t || !isEligible(t.joinedAtIndex, index)) continue
          t.score += pts
          if (c.pids.length > 1) t.hits++
        }
      }
      // Show the biggest cluster of the round as a "the hive said" bar.
      const top = clusters[0]
      if (top) bars.push({ label: top.label, count: top.pids.length, note: content.prompt })
    }
    totals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    bars.sort((a, b) => b.count - a.count)
    return {
      headline: totals[0]?.score ? `${totals[0].name} thinks like the room` : undefined,
      leaderboard: totals.map((t) => ({ id: t.id, name: t.name, score: t.score, detail: `${t.hits} matched` })),
      distributions: bars.length ? [{ title: 'The hive mind', bars: bars.slice(0, 6) }] : [],
      stats: [{ label: 'Prompts', value: ctx.rounds.length }],
    }
  },
})
