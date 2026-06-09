/**
 * Pure, tested logic for Call It, a host-resolved live-prediction game. The host poses
 * a quick prediction with a couple of options ("Will they score this drive?" Yes / No),
 * the room locks in a pick, then the host watches whatever is actually happening (a game
 * on the TV, the next round of another game, real life) and taps the real outcome. Every
 * player who called it right scores; the board carries across as many calls as the host
 * wants to run, which makes it the perfect second screen for a bar with a game already on.
 *
 * The custom Host/Player drive the show over the relay's `/x/` channels; everything that
 * decides a score lives here so it can be unit-tested. Nothing is withheld: the outcome
 * is unknown until it happens in the real world, not stored in the config.
 */

/** Points for calling an outcome correctly. Flat: every right call is worth the same,
 *  so a late joiner can still climb and nobody is mathematically eliminated. */
export const CORRECT_POINTS = 100

/** A prediction the host poses: a prompt and 2 to 4 options. */
export interface CallSpec {
  prompt: string
  options: string[]
}

export type CallPhase = 'open' | 'locked' | 'result'

/** The retained call state the host publishes on `/x/call`. `outcome` is null until the
 *  host resolves it (and stays null for a voided call); `tally` is filled at result so
 *  the room can see how it split. No player picks travel in this state. */
export interface CallState {
  i: number
  phase: CallPhase
  prompt: string
  options: string[]
  outcome: number | null
  tally: number[]
}

/** Count picks per option (ignoring out-of-range choices). */
export function tallyPicks(picks: Map<string, number>, optionCount: number): number[] {
  const t = new Array(optionCount).fill(0) as number[]
  for (const c of picks.values()) if (Number.isInteger(c) && c >= 0 && c < optionCount) t[c] = (t[c] ?? 0) + 1
  return t
}

/** Score one resolved call: each player whose pick matches the outcome earns
 *  `CORRECT_POINTS`. A null/negative outcome (a voided call) scores nobody. */
export function scoreCall(picks: Map<string, number>, outcome: number | null): Map<string, number> {
  const out = new Map<string, number>()
  if (outcome == null || outcome < 0) return out
  for (const [pid, c] of picks) if (c === outcome) out.set(pid, CORRECT_POINTS)
  return out
}

/** Fold a call's per-player points into the running totals (mutates + returns `totals`). */
export function applyScores(totals: Map<string, number>, delta: Map<string, number>): Map<string, number> {
  for (const [pid, pts] of delta) totals.set(pid, (totals.get(pid) ?? 0) + pts)
  return totals
}

export interface LeaderRow {
  id: string
  name: string
  score: number
}

/** Build the standings board: every roster member at their running total (0 if unscored),
 *  sorted high to low then by name. Names resolve from the captured map first. */
export function callBoard(totals: Map<string, number>, names: Map<string, string>, roster: Array<{ id: string; name: string }>): LeaderRow[] {
  const score = new Map<string, number>()
  for (const r of roster) {
    score.set(r.id, totals.get(r.id) ?? 0)
    names.set(r.id, r.name)
  }
  for (const [pid, pts] of totals) if (!score.has(pid)) score.set(pid, pts)
  return [...score.entries()]
    .map(([id, s]) => ({ id, name: names.get(id) ?? 'Player', score: s }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/** A spec is playable when it has a prompt and at least two non-empty, distinct options. */
export function isPlayableSpec(spec: CallSpec): boolean {
  const opts = spec.options.map((o) => o.trim()).filter(Boolean)
  return spec.prompt.trim().length > 0 && opts.length >= 2 && new Set(opts).size === opts.length
}

/** Ready-made option sets the host can drop in (then just type the prompt). */
export const OPTION_SETS: Array<{ name: string; options: string[] }> = [
  { name: 'Yes / No', options: ['Yes', 'No'] },
  { name: 'Over / Under', options: ['Over', 'Under'] },
  { name: 'Higher / Lower', options: ['Higher', 'Lower', 'Same'] },
  { name: 'This / That', options: ['This', 'That'] },
]

/** A few example prompts to seed the idea (the host edits freely). Brand-free. */
export const EXAMPLE_PROMPTS: string[] = [
  'Will it happen in the next five minutes?',
  'Do they score on this drive?',
  'Who takes the next round?',
  'Will the next song be one we know?',
  'Does this end well?',
]
