/**
 * Wavelength block, the clue-giver dial and the first game that needs the P7
 * foundation in a JUDGE round: the guess round's `assignContent` reads the prior clue
 * round (its inputs AND its withheld answer, via `sources`) to give the clue-giver a
 * different view from the guessers.
 *
 * Each item is two rounds of this one block (a `phase` field, like the doodle block):
 *  - `clue`: one player (the clue-giver, rotating by `item`) is privately shown the
 *    hidden TARGET on the spectrum and writes a clue; everyone else just waits. The
 *    target is withheld (redactContent strips it from the public config; it reaches
 *    the clue-giver only through their private per-player address). The withheld
 *    answer carries { clueGiverPid, target }.
 *  - `guess`: `derive` publishes the clue + poles (shared, for the host and the
 *    guessers) and withholds { clueGiverPid, target }; `assignContent` (the foundation)
 *    reads the clue round and overrides ONLY the clue-giver with a "watch them guess"
 *    view (so they don't see a dial they already know the answer to). Guessers slide
 *    the dial; closeness to the target scores them and (on average) the clue-giver.
 */
import {
  type AssignContext,
  type AssignedContent,
  type BlockResultsContext,
  type DeriveContext,
  type ResultsFragment,
  type RevealContext,
  defineBlock,
  z,
} from '@doot-games/sdk'
import { chainOrder } from '../../runtime/chain'
import { scoreWavelength } from './logic'
import WavelengthHost from './WavelengthHost.vue'
import WavelengthPlayer from './WavelengthPlayer.vue'
import WavelengthReveal from './WavelengthReveal.vue'

export const wavelengthContentSchema = z.object({
  phase: z.enum(['clue', 'guess']).default('clue'),
  leftLabel: z.string().min(1).default('Cold').describe('The left pole of the spectrum.'),
  rightLabel: z.string().min(1).default('Hot').describe('The right pole of the spectrum.'),
  /** The hidden target position (0-100). Stripped from the public config; shown only
   *  to the clue-giver via their private address. */
  target: z.number().min(0).max(100).default(50),
  /** Which item this is (drives the rotating clue-giver). */
  item: z.number().int().nonnegative().default(0),
  /** Runtime-only: the clue, filled by the guess round's derive (never authored). */
  clue: z.string().optional(),
  timer: z.number().int().nonnegative().nullable().default(45),
})
export type WavelengthContent = z.infer<typeof wavelengthContentSchema>

export interface WavelengthInput {
  clue?: string
  value?: number | null
}

/** The per-player view delivered privately. The clue-giver gets the target; on a
 *  guess round a guesser falls back to the shared derived content (no `isGiver`). */
export interface WavelengthSecret {
  phase: 'clue' | 'guess'
  isGiver: boolean
  leftLabel: string
  rightLabel: string
  target?: number
  clue?: string
}

/** The withheld answer key: who the clue-giver is and the target. */
export interface WavelengthAnswer {
  clueGiverPid: string
  target: number
}

export interface WavelengthRevealSummary {
  target: number
  leftLabel: string
  rightLabel: string
  clue: string
  clueGiver: string
  clueGiverPoints: number
  guesses: Array<{ name: string; value: number; points: number }>
}

const trimClue = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 60)

/** The clue-giver pid for an item: a stable ring seated by sorted pid, rotated by the
 *  item number, so each item a different player gives the clue (reconnect-safe). */
function clueGiverFor(playerIds: string[], item: number): string {
  const order = chainOrder(playerIds, (x) => x)
  if (!order.length) return ''
  return order[((item % order.length) + order.length) % order.length] ?? ''
}

export const wavelengthBlock = defineBlock<WavelengthContent, WavelengthInput>({
  kind: 'wavelength',
  name: 'Wavelength',
  contentSchema: wavelengthContentSchema,
  defaultContent: () => ({ phase: 'clue', leftLabel: 'Cold', rightLabel: 'Hot', target: 50, item: 0, timer: 45 }),
  defaultTimer: 45,
  timerOf: (c) => c.timer,
  emptyInput: (content) => (content?.phase === 'guess' ? { value: null } : { clue: '' }),
  isComplete: (content, input) => {
    const c = content as unknown as WavelengthSecret
    if (c.phase === 'guess') return c.isGiver ? true : typeof input?.value === 'number'
    return c.isGiver ? trimClue(input?.clue ?? '').length > 0 : true // waiters are always "ready"
  },
  PlayerInput: WavelengthPlayer,
  HostDisplay: WavelengthHost,
  PlayerReveal: WavelengthReveal,
  // The composition wires phase/item, derive fills the clue, and the target is the
  // withheld secret: hide them all from the editor auto-form (only the poles + timer
  // are author-facing). All are optional/defaulted, so the schema still validates.
  derivedFields: ['phase', 'item', 'clue', 'target'],

  // The target is secret: strip it from the public config (it reaches the clue-giver
  // only via their private per-player address).
  redactContent: (c) => ({ ...c, target: -1 }),

  // The clue round renders the question topic for guessers via the make-round prompt;
  // a guesser's submission renders to its clue text for any generic consumer.
  toVoteText: (_c, input) => trimClue(input?.clue ?? ''),

  assignContent: (ctx: AssignContext<WavelengthContent>): AssignedContent<WavelengthContent> => {
    const c = ctx.content
    const ids = ctx.players.map((p) => p.id)
    if (c.phase === 'clue') {
      const clueGiverPid = clueGiverFor(ids, c.item)
      if (!clueGiverPid) return { perPlayer: {} }
      const perPlayer: Record<string, WavelengthSecret> = {}
      for (const p of ctx.players) {
        perPlayer[p.id] =
          p.id === clueGiverPid
            ? { phase: 'clue', isGiver: true, leftLabel: c.leftLabel, rightLabel: c.rightLabel, target: c.target }
            : { phase: 'clue', isGiver: false, leftLabel: c.leftLabel, rightLabel: c.rightLabel }
      }
      return {
        perPlayer: perPlayer as unknown as Record<string, WavelengthContent>,
        answer: { clueGiverPid, target: c.target } satisfies WavelengthAnswer,
      }
    }
    // guess phase: read the clue round (the P7 foundation) and override ONLY the
    // clue-giver with a watch view. Guessers get nothing here and use the derived
    // content (the shared clue + poles).
    const src = ctx.sources[0]
    const ans = src?.answer as WavelengthAnswer | undefined
    const clueGiverPid = ans?.clueGiverPid ?? ''
    if (!src || !clueGiverPid) return { perPlayer: {} }
    const clue = trimClue((src.inputs.get(clueGiverPid) as WavelengthInput | undefined)?.clue ?? '')
    const giverView: WavelengthSecret = {
      phase: 'guess',
      isGiver: true,
      leftLabel: c.leftLabel,
      rightLabel: c.rightLabel,
      clue,
      target: ans?.target ?? -1,
    }
    return { perPlayer: { [clueGiverPid]: giverView as unknown as WavelengthContent } }
  },

  // guess phase: publish the shared clue + poles (target kept at -1, withheld) for the
  // host and the guessers, and withhold { clueGiverPid, target } for scoring + reveal.
  // The CLUE phase derives nothing, so the room uses the redacted authored content
  // (target stripped); the clue-giver gets the target via their private address.
  derive: (ctx: DeriveContext<WavelengthContent>) => {
    // The clue round publishes only the poles with the target stripped (players use
    // their private per-player view, the host shows "a clue is brewing").
    if (ctx.content.phase !== 'guess') return { publish: { ...ctx.content, target: -1 } }
    const src = ctx.sources[0]
    const ans = src?.answer as WavelengthAnswer | undefined
    const clueGiverPid = ans?.clueGiverPid ?? ''
    const clue = trimClue((src?.inputs.get(clueGiverPid) as WavelengthInput | undefined)?.clue ?? '')
    return {
      publish: {
        phase: 'guess',
        leftLabel: ctx.content.leftLabel,
        rightLabel: ctx.content.rightLabel,
        target: -1,
        clue,
        item: ctx.content.item,
        timer: ctx.content.timer,
      },
      answer: { clueGiverPid, target: ans?.target ?? -1 } satisfies WavelengthAnswer,
    }
  },

  revealSummary: (ctx: RevealContext<WavelengthContent, WavelengthInput>): WavelengthRevealSummary | undefined => {
    if (ctx.content.phase !== 'guess') return undefined
    const ans = ctx.answer as WavelengthAnswer | undefined
    const target = ans?.target ?? 0
    const clueGiverPid = ans?.clueGiverPid ?? ''
    const guesses = new Map<string, number>()
    for (const [pid, v] of ctx.inputs) {
      if (pid !== clueGiverPid && typeof v?.value === 'number') guesses.set(pid, v.value)
    }
    const { marks, clueGiverPoints } = scoreWavelength(target, guesses)
    const nameOf = (pid: string) => ctx.players.find((p) => p.id === pid)?.name ?? 'Someone'
    return {
      target,
      leftLabel: ctx.content.leftLabel,
      rightLabel: ctx.content.rightLabel,
      clue: (ctx.content as { clue?: string }).clue ?? '',
      clueGiver: nameOf(clueGiverPid),
      clueGiverPoints,
      guesses: marks.map((m) => ({ name: nameOf(m.pid), value: m.value, points: m.points })),
    }
  },

  aggregate: (ctx: BlockResultsContext<WavelengthContent, WavelengthInput>): ResultsFragment => {
    const scores = new Map<string, number>()
    const nameOf = (pid: string) => ctx.players.find((p) => p.id === pid)?.name ?? 'Someone'
    let items = 0
    for (const round of ctx.rounds) {
      if ((round.content as WavelengthContent).phase !== 'guess') continue // clue rounds don't score
      const ans = ctx.answerFor(round.index) as WavelengthAnswer | undefined
      if (!ans) continue
      items++
      const guesses = new Map<string, number>()
      for (const [pid, v] of ctx.inputsFor(round.index)) {
        if (pid !== ans.clueGiverPid && typeof v?.value === 'number') guesses.set(pid, v.value)
      }
      const { perGuesser, clueGiverPoints } = scoreWavelength(ans.target, guesses)
      for (const [pid, pts] of perGuesser) scores.set(pid, (scores.get(pid) ?? 0) + pts)
      if (ans.clueGiverPid && clueGiverPoints) {
        scores.set(ans.clueGiverPid, (scores.get(ans.clueGiverPid) ?? 0) + clueGiverPoints)
      }
    }
    const pids = new Set<string>([...ctx.players.map((p) => p.id), ...scores.keys()])
    const leaderboard = [...pids]
      .map((pid) => ({ id: pid, name: nameOf(pid), score: scores.get(pid) ?? 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return { leaderboard, stats: [{ label: 'Reads', value: items }] }
  },
})
