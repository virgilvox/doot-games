/**
 * Chainline block, the per-player CHAIN round (the "telephone" / exquisite-corpse
 * shape) and the first game built on the P7 pipeline foundation: per-player content
 * derived from a PRIOR round's inputs (`assignContent` reading `sources`).
 *
 * The flow (Story Chain):
 *  - Round 0 (the SEED round): everyone writes an opening line. No source, so
 *    `assignContent` hands out nothing and the player sees the authored seed prompt.
 *  - Every later round: each player privately receives their LEFT neighbor's line
 *    from the round before and writes the next line, seeing ONLY that one line. The
 *    threads rotate one seat per round, so each story visits every player once.
 *  - Results: the block's `aggregate` unspools every thread (origin -> ... -> end)
 *    into `recap`, which Story Chain's custom Results view renders.
 *
 * The frozen ring is derived with ZERO engine state: it is the sorted set of pids
 * who submitted ROUND 0, passed to every later round as a source (the composition
 * sets `from: [prev, 0]`). Round 0's inputs never change after it locks, so the ring
 * is stable and reconnect-safe. Seating is by sorted pid (the per-index `shuffle`
 * the assign context hands us is deliberately NOT used for the ring, as it would
 * differ each round; see `chainOrder`).
 *
 * Withholding: there is no answer key and nothing secret in the authored config, so
 * no `redactContent`/`answerOf`/`REDACTION_RULES`. The privacy that matters (not
 * seeing others' in-progress lines) is enforced by the engine: per-player content
 * lands only on each player's own private address, and nothing is published publicly
 * until the final unspool.
 */
import {
  type AssignContext,
  type AssignedContent,
  type BlockResultsContext,
  type ResultsFragment,
  type ScorePlayer,
  defineBlock,
  z,
} from '@doot-games/sdk'
import { chainOrder, chainSourceFor, chainThreads } from '../../runtime/chain'
import ChainlineHost from './ChainlineHost.vue'
import ChainlinePlayer from './ChainlinePlayer.vue'

export const chainlineContentSchema = z.object({
  prompt: z.string().default('Continue the story.').describe('What this round asks the player to write.'),
  /** 1-based position of this round, for "Round 2 of 5" on the big screen. */
  step: z.number().int().positive().default(1),
  /** Total rounds in the chain. */
  total: z.number().int().positive().default(1),
  /** The seed (opening) round: no line received, the player starts a new thread. */
  seed: z.boolean().default(false),
  timer: z.number().int().nonnegative().nullable().default(60).describe('Seconds to write a line.'),
})
export type ChainlineContent = z.infer<typeof chainlineContentSchema>

/** A player's input: the line they wrote this round. */
export interface ChainlineInput {
  text: string
}

/** The SECRET per-player view delivered to a player's own private address on a pass
 *  round: the authored content plus the single line they received to build on. */
export interface ChainlineSecret extends ChainlineContent {
  received: string
}

/** One step of an unspooled thread, names resolved, for the Results view. */
export interface ChainStepView {
  step: number
  name: string
  text: string
}
/** The `recap` payload: every thread, in origin order. */
export interface ChainlineRecap {
  threads: ChainStepView[][]
}

/** Trim a line and bound its length. */
export function cleanLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240)
}

/** The frozen ring: sorted pids that submitted the SEED round. The seed source is
 *  identified by its content flag (`seed: true`), not a fixed index, so the chain
 *  survives a composition where the seed round is not at config index 0; it falls
 *  back to the lowest-indexed source. */
function ringFromSources(sources: AssignContext<ChainlineContent>['sources']): string[] {
  const seed =
    sources.find((s) => (s.content as { seed?: boolean } | undefined)?.seed === true) ??
    [...sources].sort((a, b) => a.index - b.index)[0]
  if (!seed) return []
  return chainOrder([...seed.inputs.keys()], (x) => x)
}

/** The immediate-previous round's inputs (the source with the highest index). */
function prevSource(sources: AssignContext<ChainlineContent>['sources']) {
  return sources.reduce<(typeof sources)[number] | undefined>(
    (best, s) => (best === undefined || s.index > best.index ? s : best),
    undefined,
  )
}

export const chainlineBlock = defineBlock<ChainlineContent, ChainlineInput>({
  kind: 'chainline',
  name: 'Chain line',
  contentSchema: chainlineContentSchema,
  defaultContent: () => ({ prompt: 'Continue the story.', step: 1, total: 1, seed: false, timer: 60 }),
  defaultTimer: 60,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ text: '' }),
  isComplete: (_c, input) => cleanLine(input.text).length > 0,
  PlayerInput: ChainlinePlayer,
  HostDisplay: ChainlineHost,

  // Per-player chain assignment: hand each player their left neighbor's line from
  // the immediately-previous round. The seed round (no sources) hands out nothing,
  // so the player falls back to the authored seed prompt.
  assignContent: (ctx: AssignContext<ChainlineContent>): AssignedContent<ChainlineContent> => {
    const order = ringFromSources(ctx.sources)
    const prev = prevSource(ctx.sources)
    if (!order.length || !prev) return { perPlayer: {} }
    const perPlayer: Record<string, ChainlineSecret> = {}
    for (const pid of order) {
      const srcPid = chainSourceFor(order, 1, pid) // the left neighbor (a pass round)
      const got = srcPid ? (prev.inputs.get(srcPid) as ChainlineInput | undefined) : undefined
      perPlayer[pid] = { ...ctx.content, seed: false, received: cleanLine(got?.text ?? '') }
    }
    return { perPlayer: perPlayer as unknown as Record<string, ChainlineContent> }
  },

  toVoteText: (_content, input) => cleanLine(input.text),

  // Unspool every thread for the Results view. The ring is round-0's submitters; a
  // thread originated by ring[k] is held by ring[(k+r) % n] in round r.
  aggregate: (ctx: BlockResultsContext<ChainlineContent, ChainlineInput>): ResultsFragment => {
    const rounds = [...ctx.rounds].sort((a, b) => a.index - b.index)
    const round0 = rounds[0]
    if (!round0) return { stats: [] }
    const order = chainOrder([...ctx.inputsFor(round0.index).keys()], (x) => x)
    const nameOf = new Map<string, string>(ctx.players.map((p: ScorePlayer) => [p.id, p.name]))
    const inputsByRound = rounds.map((r) => ctx.inputsFor(r.index))
    const raw = chainThreads(order, inputsByRound)
    const threads: ChainStepView[][] = raw.map((thread) =>
      thread.map((s) => ({
        step: s.roundIndex + 1,
        name: nameOf.get(s.pid) ?? 'Someone',
        text: cleanLine((s.input as ChainlineInput | undefined)?.text ?? ''),
      })),
    )
    const recap: ChainlineRecap = { threads }
    const n = threads.length
    return {
      headline: n > 0 ? `${n} ${n === 1 ? 'story' : 'stories'} told` : undefined,
      stats: [{ label: 'Stories', value: n }],
      recap,
    }
  },
})
