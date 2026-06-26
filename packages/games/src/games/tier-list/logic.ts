/**
 * Pure logic for the item-by-item Tier List flagship: resolve a single item's tier
 * votes into a consensus + distribution, and accumulate a "match the room" leaderboard
 * across the items placed so far. The host owns all of this and drives the show over
 * `/x/`; nothing here touches the relay or Vue, so it is unit-tested in isolation.
 */
import { tierProximity } from '../../blocks/tier/logic'

export const TIER_POINTS = 1000

/** Tally one item's tier votes (each value is a tier index). Out-of-range / non-integer
 *  votes are dropped, mirroring the block's hardening against forged relay values. */
export function tallyVotes(votes: Iterable<number>, tierCount: number): number[] {
  const counts = new Array<number>(tierCount).fill(0)
  for (const t of votes) {
    if (Number.isInteger(t) && t >= 0 && t < tierCount) counts[t] = (counts[t] ?? 0) + 1
  }
  return counts
}

export interface ItemResult {
  /** The consensus (modal) tier index, or -1 if nobody voted. */
  tier: number
  /** Share who chose the modal tier (0..1). */
  agreement: number
  /** Votes per tier index (for the reveal bars). */
  counts: number[]
  total: number
}

/** Resolve an item's votes to its consensus tier (mode; ties favour the higher tier =
 *  lower index, matching the block). */
export function resolveItem(votes: Map<string, number>, tierCount: number): ItemResult {
  const counts = tallyVotes(votes.values(), tierCount)
  let total = 0
  for (const c of counts) total += c
  if (total === 0) return { tier: -1, agreement: 0, counts, total: 0 }
  let best = 0
  for (let i = 1; i < tierCount; i++) if ((counts[i] ?? 0) > (counts[best] ?? 0)) best = i
  return { tier: best, agreement: (counts[best] ?? 0) / total, counts, total }
}

export interface PlacedItem {
  /** The item's index in the list. */
  index: number
  /** Its resolved consensus tier (>= 0). */
  tier: number
  /** Each player's vote for this item (pid -> tier index). */
  votes: Map<string, number>
}
export interface LeaderRow {
  id: string
  name: string
  score: number
  hits: number
}

/** The running "TOP OF THE ROOM": each player earns match-the-room points on every
 *  placed item (exact tier = full, one off = half), summed and sorted. */
export function leaderboard(
  roster: Array<{ id: string; name: string }>,
  placed: PlacedItem[],
): LeaderRow[] {
  const rows = new Map<string, LeaderRow>(roster.map((r) => [r.id, { id: r.id, name: r.name, score: 0, hits: 0 }]))
  for (const item of placed) {
    if (item.tier < 0) continue
    for (const [pid, tier] of item.votes) {
      const row = rows.get(pid)
      if (!row) continue
      const p = tierProximity(tier, item.tier)
      row.score += Math.round(TIER_POINTS * p)
      if (p === 1) row.hits++
    }
  }
  return [...rows.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
