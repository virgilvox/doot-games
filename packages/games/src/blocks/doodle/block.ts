/**
 * Doodle block, the DRAW-and-DESCRIBE chain round (Gartic Phone) and the second game
 * on the P7 pipeline foundation. It is the picture cousin of `chainline`: the same
 * per-player rotation (each round you privately receive your LEFT neighbor's previous
 * output and build on it), but the rounds ALTERNATE between writing and drawing.
 *
 *  - Round 0 (seed, `mode: 'describe'`): everyone writes a prompt for someone to draw.
 *  - A `draw` round: you receive the TEXT a neighbor wrote and draw it (DrawCanvas).
 *  - A `describe` round: you receive the DRAWING a neighbor made and write what it is.
 *  - Results: the thread unspools as prompt -> drawing -> guess -> drawing -> ...
 *
 * The rotation, the frozen ring (sorted round-0 submitters), and the secrecy model
 * are identical to `chainline` (shared helpers in `runtime/chain.ts`); only the input
 * type (text OR strokes) and the views differ. No answer key, nothing secret in the
 * authored config, so no `redactContent`/`answerOf`/`REDACTION_RULES`: a player's
 * in-progress work lives only on their private address until the final unspool.
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
import type { DrawStroke, DrawValue } from '@doot-games/ui'
import { chainOrder, chainPrevSource, chainRingFromSources, chainSourceFor, chainThreads } from '../../runtime/chain'
import DoodleHost from './DoodleHost.vue'
import DoodlePlayer from './DoodlePlayer.vue'

export const doodleContentSchema = z.object({
  mode: z.enum(['draw', 'describe']).default('describe').describe('Draw the received text, or describe the received drawing.'),
  prompt: z.string().default('Describe what you see.').describe('What this round asks the player to do.'),
  step: z.number().int().positive().default(1),
  total: z.number().int().positive().default(1),
  seed: z.boolean().default(false).describe('The opening round: write a prompt for someone to draw.'),
  aspect: z.number().positive().default(0.7).describe('Drawing canvas shape (height / width).'),
  timer: z.number().int().nonnegative().nullable().default(60),
})
export type DoodleContent = z.infer<typeof doodleContentSchema>

/** A player's input: a written line (describe/seed rounds) OR a drawing (draw rounds). */
export interface DoodleInput {
  text?: string
  strokes?: DrawStroke[]
}

/** The SECRET per-player view delivered to a player's private address on a pass round:
 *  the authored content plus the neighbor output to build on (text or a drawing). */
export interface DoodleSecret extends DoodleContent {
  received: DoodleInput
}

/** One unspooled step, resolved for the gallery: text for a written step, a drawing
 *  for a drawn step. */
export interface DoodleStepView {
  step: number
  name: string
  mode: 'draw' | 'describe'
  text: string
  drawing?: DrawValue
}
export interface DoodleRecap {
  threads: DoodleStepView[][]
  aspect: number
}

const cleanText = (raw: string): string => raw.replace(/\s+/g, ' ').trim().slice(0, 200)
const hasStrokes = (i: DoodleInput | undefined): boolean => Array.isArray(i?.strokes) && i.strokes.length > 0

export const doodleBlock = defineBlock<DoodleContent, DoodleInput>({
  kind: 'doodle',
  name: 'Doodle',
  contentSchema: doodleContentSchema,
  defaultContent: () => ({ mode: 'describe', prompt: 'Describe what you see.', step: 1, total: 1, seed: false, aspect: 0.7, timer: 60 }),
  defaultTimer: 60,
  timerOf: (c) => c.timer,
  emptyInput: (content) => (content?.mode === 'draw' ? { strokes: [] } : { text: '' }),
  isComplete: (content, input) =>
    content?.mode === 'draw' ? hasStrokes(input) : cleanText(input?.text ?? '').length > 0,
  PlayerInput: DoodlePlayer,
  HostDisplay: DoodleHost,

  // Per-player chain assignment: hand each player their left neighbor's previous
  // output (the raw input, text or strokes). The seed round (no sources) hands out
  // nothing, so the player writes a fresh prompt.
  assignContent: (ctx: AssignContext<DoodleContent>): AssignedContent<DoodleContent> => {
    const order = chainRingFromSources(ctx.sources)
    const prev = chainPrevSource(ctx.sources)
    if (!order.length || !prev) return { perPlayer: {} }
    const perPlayer: Record<string, DoodleSecret> = {}
    for (const pid of order) {
      const srcPid = chainSourceFor(order, 1, pid)
      const got = (srcPid ? prev.inputs.get(srcPid) : undefined) as DoodleInput | undefined
      // Keep only the field this round consumes: a draw round reads the neighbor's
      // text, a describe round reads the neighbor's drawing.
      const received: DoodleInput =
        ctx.content.mode === 'draw'
          ? { text: cleanText(got?.text ?? '') }
          : { strokes: hasStrokes(got) ? (got?.strokes ?? []) : [] }
      perPlayer[pid] = { ...ctx.content, seed: false, received }
    }
    return { perPlayer: perPlayer as unknown as Record<string, DoodleContent> }
  },

  toVoteText: (_content, input) => cleanText(input?.text ?? ''),

  // Unspool every thread, resolving each step to its written text or its drawing by
  // that round's mode. The ring is the seed round's submitters.
  aggregate: (ctx: BlockResultsContext<DoodleContent, DoodleInput>): ResultsFragment => {
    const rounds = [...ctx.rounds].sort((a, b) => a.index - b.index)
    const seedRound = rounds.find((r) => (r.content as DoodleContent).seed) ?? rounds[0]
    if (!seedRound) return { stats: [] }
    const order = chainOrder([...ctx.inputsFor(seedRound.index).keys()], (x) => x)
    const nameOf = new Map<string, string>(ctx.players.map((p: ScorePlayer) => [p.id, p.name]))
    const inputsByRound = rounds.map((r) => ctx.inputsFor(r.index))
    const modeByRound = rounds.map((r) => (r.content as DoodleContent).mode)
    const raw = chainThreads(order, inputsByRound)
    const threads: DoodleStepView[][] = raw.map((thread) =>
      thread.map((s) => {
        const input = s.input as DoodleInput | undefined
        const mode = modeByRound[s.roundIndex] ?? 'describe'
        return {
          step: s.roundIndex + 1,
          name: nameOf.get(s.pid) ?? 'Someone',
          mode,
          text: cleanText(input?.text ?? ''),
          drawing: mode === 'draw' && hasStrokes(input) ? { strokes: input?.strokes ?? [] } : undefined,
        }
      }),
    )
    const n = threads.length
    return {
      headline: n > 0 ? `${n} ${n === 1 ? 'doodle chain' : 'doodle chains'} unspooled` : undefined,
      stats: [{ label: 'Chains', value: n }],
      recap: { threads, aspect: (seedRound.content as DoodleContent).aspect ?? 0.7 } satisfies DoodleRecap,
    }
  },
})
