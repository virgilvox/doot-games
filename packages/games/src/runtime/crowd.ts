/**
 * P4B: the capped, discounted "crowd" bloc. When a host turns on "the crowd's votes
 * count", spectator votes fold into a scored judge round's tally as a single bloc
 * worth a FRACTION of the players, distributed across options by the crowd's own
 * split. The crowd can nudge a close round but never overrule the room, and audience
 * members never enter the leaderboard (only their aggregate per-option counts matter).
 *
 * Pure and shared by the vote-tallying blocks (vote/split/fibvote) so the cap is
 * identical everywhere (the big screen, the phone reveal, and the score all agree).
 */

/** The whole crowd, as a bloc, is worth at most this fraction of the player votes. */
export const AUDIENCE_BLOC_FRACTION = 0.5

/**
 * Per-option vote ADDITIONS the crowd contributes, to add onto the player counts.
 * `playerTotal` is the number of (self-vote-excluded) player votes in the round;
 * `crowdCounts` is the crowd's votes per option key. The crowd's cap is
 * `round(playerTotal * AUDIENCE_BLOC_FRACTION)` (floored at 1 so a tiny room still
 * feels the crowd), split proportionally by the crowd's choices. Returns an empty
 * map when the crowd cast no votes (so an off/empty crowd changes nothing). Pure.
 */
export function crowdBloc(playerTotal: number, crowdCounts: Map<string, number>): Map<string, number> {
  const add = new Map<string, number>()
  const crowdTotal = [...crowdCounts.values()].reduce((a, b) => a + b, 0)
  if (crowdTotal <= 0) return add
  const cap = Math.max(1, Math.round(playerTotal * AUDIENCE_BLOC_FRACTION))
  // Apportion the cap across options by crowd share with the largest-remainder method,
  // so the additions sum to EXACTLY `cap` and never overshoot it (independent per-option
  // rounding could exceed the cap, e.g. a 50/50 crowd both rounding up - then the bloc
  // could decide a close round instead of only nudging it).
  const parts = [...crowdCounts].map(([key, c]) => {
    const exact = (cap * c) / crowdTotal
    const floor = Math.floor(exact)
    return { key, floor, frac: exact - floor }
  })
  let remaining = cap - parts.reduce((s, p) => s + p.floor, 0)
  // Hand the leftover units to the largest fractional remainders (ties: by count desc).
  parts.sort((a, b) => b.frac - a.frac || (crowdCounts.get(b.key) ?? 0) - (crowdCounts.get(a.key) ?? 0))
  for (const p of parts) {
    const v = p.floor + (remaining > 0 ? 1 : 0)
    if (remaining > 0) remaining--
    if (v > 0) add.set(p.key, v)
  }
  return add
}

/** Count a crowd's option choices ({choice: key}) into a per-key map. Pure. */
export function crowdChoiceCounts(crowd: Map<string, { choice?: string }> | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  if (crowd) for (const v of crowd.values()) {
    const c = v?.choice
    if (c != null) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return counts
}
