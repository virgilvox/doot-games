/**
 * Tier-list math, pure and tested. A tier round shows a SET of items and a set of
 * named tiers (S/A/B/C/D…, index 0 = top). Every player places each item into a
 * tier; the room's consensus board is computed per item.
 *
 * The output is per ITEM, never per player, which is the whole reason a tier board
 * scales to a packed room: 100 players collapse into one fixed-size board (tiers x
 * items), the crowd size showing up only as agreement strength and a vote count.
 *
 * Consensus uses the MODE (the most-voted tier), not the mean. A mean is wrong for
 * buckets: a 50/50 S-vs-D split averages to the middle tier, a bucket nobody chose.
 * The mode places an item where most of the room actually put it, and `agreement`
 * tells you how settled that is (the controversy is the content).
 */
import { BASE_POINTS } from '../scoring'

export interface TierDef {
  label: string
  /** A CSS colour for the lane (a hex default; authors can recolour). */
  color: string
  /** An optional descriptive name shown beside the letter (e.g. "GOD TIER"). */
  sublabel?: string
}
export interface TierItem {
  id: string
  label: string
  image?: string
}
/** A player's board: item id -> tier index (0 = top). Unplaced items are absent. */
export type TierPlacements = Record<string, number>

export interface ItemConsensus {
  id: string
  label: string
  image?: string
  /** The consensus (modal) tier index, or -1 when nobody placed this item. */
  tier: number
  /** Share of voters who chose the modal tier (0..1). 1 = unanimous. */
  agreement: number
  /** How split the room was (0..1). Higher = more divisive (the debate fuel). */
  controversy: number
  /** Votes per tier index (length === tier count), for a split sparkline. */
  votes: number[]
  /** Total players who placed this item. */
  total: number
}

/** The classic tier gradient, used as editable defaults so a fresh board reads as a
 *  tier list at a glance. Index 0 is the top tier. */
export const DEFAULT_TIERS: TierDef[] = [
  { label: 'S', color: '#ff6b6b', sublabel: 'GOD TIER' },
  { label: 'A', color: '#ffa94d', sublabel: 'GREAT' },
  { label: 'B', color: '#ffd43b', sublabel: 'GOOD' },
  { label: 'C', color: '#69db7c', sublabel: 'FINE' },
  { label: 'D', color: '#4dabf7', sublabel: 'EH' },
]

/** Pick a readable text colour (near-black or white) for a label sitting ON a tier
 *  colour, so an author who recolours a band to something dark still gets a legible
 *  letter (the band label is a primary cue, never colour alone). Non-hex inputs fall
 *  back to dark. Pure + tested. */
export function textOn(color: string): string {
  let s = (color ?? '').trim().replace(/^#/, '')
  // Expand a 3-digit shorthand (#0a8 -> 00aa88) so a valid short hex like #000 / #fff
  // gets the right contrast instead of falling through to the dark default.
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = [...s].map((ch) => ch + ch).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return '#1a1a1a'
  const n = Number.parseInt(s, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Perceived luminance; the pastel defaults stay dark-texted (>0.5), darker custom
  // colours flip to white.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? '#1a1a1a' : '#ffffff'
}

/** Tally one item's votes across every player's board. Out-of-range tiers are dropped. */
export function tallyItem(itemId: string, tierCount: number, placements: Iterable<TierPlacements>): number[] {
  const votes = new Array(tierCount).fill(0)
  for (const board of placements) {
    const t = board?.[itemId]
    if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < tierCount) votes[t]++
  }
  return votes
}

/** Consensus for one item: its modal tier (ties resolve to the HIGHER tier, the
 *  lower index, matching the generous tie-break used elsewhere) plus agreement and
 *  controversy. No votes -> tier -1 (it stays in the unplaced tray). */
export function itemConsensus(item: TierItem, tierCount: number, placements: TierPlacements[]): ItemConsensus {
  const votes = tallyItem(item.id, tierCount, placements)
  let total = 0
  for (const v of votes) total += v
  if (total === 0) {
    return { id: item.id, label: item.label, image: item.image, tier: -1, agreement: 0, controversy: 0, votes, total: 0 }
  }
  let best = 0
  for (let i = 1; i < tierCount; i++) if ((votes[i] ?? 0) > (votes[best] ?? 0)) best = i
  const agreement = (votes[best] ?? 0) / total
  return {
    id: item.id,
    label: item.label,
    image: item.image,
    tier: best,
    agreement,
    controversy: 1 - agreement,
    votes,
    total,
  }
}

/** The whole board: every item's consensus, in the authored item order. */
export function consensusBoard(items: TierItem[], tierCount: number, placements: TierPlacements[]): ItemConsensus[] {
  return items.map((it) => itemConsensus(it, tierCount, placements))
}

/** Group a computed board by tier index (0..tierCount-1). Within a tier, the most
 *  agreed-on items lead. Items with no votes (tier -1) are returned separately as
 *  the "unplaced" tray. */
export function boardByTier(
  board: ItemConsensus[],
  tierCount: number,
): { lanes: ItemConsensus[][]; unplaced: ItemConsensus[] } {
  const lanes: ItemConsensus[][] = Array.from({ length: tierCount }, () => [])
  const unplaced: ItemConsensus[] = []
  for (const c of board) {
    if (c.tier < 0) unplaced.push(c)
    else lanes[c.tier]?.push(c)
  }
  for (const lane of lanes) lane.sort((a, b) => b.agreement - a.agreement || a.label.localeCompare(b.label))
  return { lanes, unplaced }
}

/** Proximity of a player's placement to the room's consensus (0..1): exact tier =
 *  full, off by one = half, further = nothing. */
export function tierProximity(placed: number | undefined, consensus: number): number {
  if (consensus < 0 || typeof placed !== 'number') return 0
  const d = Math.abs(placed - consensus)
  if (d === 0) return 1
  if (d === 1) return 0.5
  return 0
}

/** Score ONE player's board against the consensus. `points` is normalised to 0..1
 *  (1 = matched every item's consensus tier); `hits` counts exact matches. The
 *  aggregate scales `points` by BASE_POINTS so a perfect board is worth one round,
 *  comparable to every other block in a mixed game. */
export function playerBoardScore(board: ItemConsensus[], placements: TierPlacements): { points: number; hits: number } {
  const scored = board.filter((c) => c.tier >= 0)
  if (!scored.length) return { points: 0, hits: 0 }
  let sum = 0
  let hits = 0
  for (const c of scored) {
    const s = tierProximity(placements?.[c.id], c.tier)
    sum += s
    if (s === 1) hits++
  }
  return { points: sum / scored.length, hits }
}

/** BASE_POINTS for a perfect board (re-exported so callers stay in one module). */
export const TIER_BASE = BASE_POINTS

/** The most divisive placed item (highest controversy, with a real split), for the
 *  "Most divisive" award. Null when nothing was contested. */
export function mostDivisive(board: ItemConsensus[]): ItemConsensus | null {
  let best: ItemConsensus | null = null
  for (const c of board) {
    if (c.total < 2 || c.controversy <= 0) continue
    if (!best || c.controversy > best.controversy) best = c
  }
  return best
}

/** A standout: the item the room most agreed on, preferring the top tiers so the
 *  award reads like a crowning ("Unanimous S"). Null when nothing was placed. */
export function standout(board: ItemConsensus[]): ItemConsensus | null {
  let best: ItemConsensus | null = null
  for (const c of board) {
    if (c.tier < 0 || c.total < 2) continue
    if (!best || c.agreement > best.agreement || (c.agreement === best.agreement && c.tier < best.tier)) best = c
  }
  return best
}
