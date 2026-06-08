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
  for (const [key, c] of crowdCounts) {
    const a = Math.round((cap * c) / crowdTotal)
    if (a > 0) add.set(key, a)
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
