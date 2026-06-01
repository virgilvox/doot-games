/**
 * Shared scoring knobs for the flagship games. Pure, deterministic, and unit-
 * tested (`scoring.test.ts`) so the logic that matters stays trustworthy
 * (CLAUDE.md). These are the recurring party-game levers the research surfaced:
 * vote-share points, round multipliers, sweep/unanimity bonuses, pity points,
 * closeness-to-even scoring (Split the Room), and Kahoot-style speed decay.
 */

/** Base points a fully-winning submission earns in an ordinary round. */
export const BASE_POINTS = 1000

/**
 * Points for an option by its share of the vote: `round(share × max)`. With
 * `max = BASE_POINTS`, taking 60% of the vote is 600 points. Zero votes (or zero
 * total) is zero.
 */
export function voteSharePoints(votes: number, totalVotes: number, max = BASE_POINTS): number {
  if (totalVotes <= 0 || votes <= 0) return 0
  return Math.round((votes / totalVotes) * max)
}

/**
 * A swing multiplier so later rounds matter more and comebacks stay possible
 * (Jackbox doubles round 2, triples the final). Here: the final round is ×2, the
 * rest ×1. `roundIndex` is zero-based within this block's rounds.
 */
export function roundMultiplier(roundIndex: number, roundCount: number): number {
  return roundCount > 1 && roundIndex === roundCount - 1 ? 2 : 1
}

/**
 * A unanimity bonus ("QUIPLASH!"): a flat reward when an option takes every vote
 * in a contested round (more than one voter). Zero otherwise.
 */
export function sweepBonus(votes: number, totalVotes: number, bonus = 500): number {
  return totalVotes > 1 && votes === totalVotes ? bonus : 0
}

/** A participation floor so a contributor who drew no votes still scores a little. */
export function pityPoints(votes: number, floor = 100): number {
  return votes > 0 ? 0 : floor
}

/**
 * Head-to-head (1v1) battle payout, Mad Verse City style: both performers earn
 * cash if they drew any votes, and the winner earns more. Getting shut out (zero
 * votes) earns nothing. On a tie, the caller marks both performers as winners so
 * both take the win rate.
 */
export function headToHeadPoints(votes: number, isWinner: boolean, win = BASE_POINTS, show = 400): number {
  if (votes <= 0) return 0
  return isWinner ? win : show
}

/**
 * A live-crowd cheer bonus (Circuit Cypher's tap-to-cheer): a small, capped
 * reward for the energy a performance drew. Deliberately small and bounded so it
 * pads a performer's cash but can never out-weigh the head-to-head vote that
 * decides the battle (`cap` < the head-to-head `show` payout). Zero for no cheers.
 */
export function cheerBonus(cheers: number, perCheer = 15, cap = 150): number {
  if (cheers <= 0) return 0
  return Math.min(Math.round(cheers) * perCheer, cap)
}

/**
 * Closeness-to-even score in [0, 1]: 1 at a perfect 50/50 split, 0 when
 * unanimous. `score = 1 − |yesFraction − 0.5| × 2`. This is Split the Room's
 * inverted objective (Jackbox publishes the principle, not a curve).
 */
export function closenessToHalf(yes: number, total: number): number {
  if (total <= 0) return 0
  const frac = yes / total
  return Math.max(0, 1 - Math.abs(frac - 0.5) * 2)
}

/** Closeness mapped to points: `round(closeness × max)`. */
export function splitPoints(yes: number, total: number, max = BASE_POINTS): number {
  return Math.round(closenessToHalf(yes, total) * max)
}

/**
 * Fib Finder (Fibbage) dual-axis scoring. Two independent ways to earn:
 *  - find the truth: a flat reward for voting the one true answer;
 *  - fool the room: a reward for every player who voted your lie.
 * Both are pure and scale with the round multiplier at the call site.
 */
export function truthFinderPoints(foundTruth: boolean, max = BASE_POINTS): number {
  return foundTruth ? max : 0
}
export function liarPoints(fooled: number, per = 500): number {
  return fooled > 0 ? Math.round(fooled) * per : 0
}

/**
 * Kahoot-style speed decay: `round((1 − (t/timer)/2) × max)`, clamped so a
 * correct answer never scores below half and an instant answer never above max.
 * `t` and `timer` are in the same unit (ms or s). A non-positive timer = full max.
 */
export function speedDecay(t: number, timer: number, max = BASE_POINTS): number {
  if (timer <= 0) return max
  const frac = Math.min(1, Math.max(0, t / timer))
  return Math.round((1 - frac / 2) * max)
}
