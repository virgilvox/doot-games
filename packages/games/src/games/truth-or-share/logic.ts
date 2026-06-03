/**
 * Pure, tested logic for Truth or Share, the directed/spotlight game: a picker
 * puts another player in the spotlight with a prompt, the target answers (or
 * passes), the room reacts, and the picker earns a CUT of the reactions, so the
 * winning play is to pick prompts and people that entertain the room, not to be
 * cruel. The custom Host/Player drive the show over the relay; everything that
 * decides points lives here so it can be unit-tested.
 */
import { seededShuffle } from '../../runtime/derive'

/** Playful, positive-leaning reactions (no "boo": the game rewards being a good
 *  sport, not piling on). */
export type ReactionKind = 'laugh' | 'love' | 'wow' | 'oof'
export const REACTION_KINDS: ReactionKind[] = ['laugh', 'love', 'wow', 'oof']

/** Points a target earns per reaction, and the share of those the picker takes. */
export const REACT_POINTS = 10
export const PICKER_CUT = 0.5

/** A target does a TRUTH (type an answer) or a SHARE (snap/upload a photo). The
 *  target chooses which; the picker then supplies the prompt for that mode. */
export type SpotMode = 'truth' | 'share'

/**
 * The phases of one spotlight turn (a four-step volley, faithful to the design:
 * the picker puts someone on the spot, the target chooses truth or share, the
 * picker supplies the prompt for that mode, the target responds, the room reacts):
 *  - pick:    the picker chooses who is on the spot
 *  - mode:    the target chooses Truth or Share
 *  - prompt:  the picker chooses (or writes) a prompt for that mode
 *  - respond: the target answers (truth = text) or shares (a photo)
 *  - react:   the answer/photo is shown to the room, which reacts
 *  - result:  the scores for the turn
 */
export type TurnPhase = 'pick' | 'mode' | 'prompt' | 'respond' | 'react' | 'result'

/** The retained turn state the host publishes on `/x/turn` for every client. The
 *  target's `response` is held back until `react`/`result`; a shared PHOTO never
 *  travels in the turn state at all (it goes on its own `/x/photo` channel, read
 *  only by the host's big screen), so the response only reaches the room when the
 *  host advances to `react` after the target chose to share it. */
export interface TurnState {
  i: number
  total: number
  phase: TurnPhase
  pickerPid: string
  pickerName: string
  /** The current roster (host-authoritative), so the picker can choose a target
   *  from the host's view of the room rather than its own presence snapshot (which
   *  can lag). The picker's UI excludes itself. */
  roster?: Array<{ pid: string; name: string }>
  target?: { pid: string; name: string } | null
  /** Which mode the target chose (set from the `mode` phase onward). */
  mode?: SpotMode | null
  /** The prompts dealt to the picker to choose from (shown only to the picker). */
  choices?: string[]
  prompt?: string | null
  /** A truth answer (text), present only at react/result. */
  response?: string | null
  /** True when the target shared a photo (the bitmap rides the `/x/photo` channel
   *  to the host's big screen, not the turn state). Set at react. */
  hasPhoto?: boolean
  passed?: boolean
  reactions?: (Record<ReactionKind, number> & { total: number }) | null
  targetPts?: number
  pickerPts?: number
}

/**
 * Withholding as a pure rule: a target's typed answer may only appear in the public
 * turn state once the host advances to `react` (after the target chose to answer).
 * Before that it is stripped, so a turn published mid-volley never carries the
 * answer. (A shared photo is never in the turn state at all, see `TurnState`.)
 */
export function redactTurnForPublish(state: TurnState): TurnState {
  const shown = state.phase === 'react' || state.phase === 'result'
  if (shown) return state
  return { ...state, response: null }
}

/** Who is the picker on a given turn: a simple rotation through the frozen order so
 *  everyone gets equal turns in the chair. */
export function pickerFor(order: string[], turnIndex: number): string | undefined {
  if (!order.length) return undefined
  return order[turnIndex % order.length]
}

/** Deal the picker a small hand of prompts to choose from for this turn, drawn
 *  deterministically (seeded by room + turn) so it is reconnect-safe and the same
 *  for every client. */
export function dealPrompts(prompts: string[], seed: string, turnIndex: number, count = 3): string[] {
  if (!prompts.length) return []
  return seededShuffle(`${seed}:turn:${turnIndex}`)(prompts).slice(0, Math.min(count, prompts.length))
}

/** Tally a set of cast reactions into a per-kind count plus a total. */
export function countReactions(reactions: Iterable<ReactionKind>): Record<ReactionKind, number> & { total: number } {
  const out = { laugh: 0, love: 0, wow: 0, oof: 0, total: 0 }
  for (const r of reactions) {
    if (REACTION_KINDS.includes(r)) {
      out[r]++
      out.total++
    }
  }
  return out
}

export interface TurnInput {
  pickerPid: string
  targetPid: string
  /** The target passed (or was skipped by the host): no points, no penalty. */
  passed: boolean
  /** Total reactions the answer drew. */
  reactions: number
}
export interface TurnScore {
  targetPts: number
  pickerPts: number
}

/**
 * Score one turn: the target earns points for the reactions their answer drew; the
 * picker takes a cut (so picking entertaining prompts/people pays). A pass scores
 * nothing for either, and never goes negative, consent is never punished.
 */
export function scoreTurn(t: TurnInput): TurnScore {
  if (t.passed || !t.targetPid || t.reactions <= 0) return { targetPts: 0, pickerPts: 0 }
  const targetPts = t.reactions * REACT_POINTS
  const pickerPts = Math.floor(targetPts * PICKER_CUT)
  return { targetPts, pickerPts }
}

export interface LeaderRow {
  id: string
  name: string
  score: number
}

/**
 * Accumulate per-player scores across all turns (a player earns as a target AND as
 * a picker). Names resolve from the captured map first, then the live roster.
 */
export function leaderboard(
  turns: TurnInput[],
  names: Map<string, string>,
  roster: Array<{ id: string; name: string }>,
): LeaderRow[] {
  const scores = new Map<string, number>()
  for (const r of roster) {
    scores.set(r.id, 0)
    names.set(r.id, r.name)
  }
  for (const t of turns) {
    const { targetPts, pickerPts } = scoreTurn(t)
    if (targetPts) scores.set(t.targetPid, (scores.get(t.targetPid) ?? 0) + targetPts)
    if (pickerPts) scores.set(t.pickerPid, (scores.get(t.pickerPid) ?? 0) + pickerPts)
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, name: names.get(id) ?? 'Someone', score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
