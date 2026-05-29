/**
 * Late-joiner eligibility. When a player publishes their profile for the first
 * time, the engine computes `joinedAtIndex` from the current phase and round
 * state. A player who joined during the lobby is eligible from round zero; a
 * player who joined mid-game is eligible from the current or next round, and
 * earlier rounds stay locked for them. Scoring only counts rounds a player was
 * present for. See PRD section 7.5.
 */
import type { Phase, RoundInfo } from './types'

/**
 * The first round index a player who joins *now* is eligible to act on.
 *
 * - Joined in the lobby (or anywhere outside active play) -> eligible from 0.
 * - Joined while the current round is still `ready` or `open` -> eligible from
 *   the current round.
 * - Joined after voting closed (`locked`/`reveal`) -> eligible from the next round.
 */
export function computeJoinedAtIndex(phase: Phase, round: RoundInfo): number {
  if (phase !== 'active') return 0
  return round.state === 'ready' || round.state === 'open' ? round.index : round.index + 1
}

/** Whether a player who joined at `joinedAtIndex` may act on `roundIndex`. */
export function isEligible(joinedAtIndex: number, roundIndex: number): boolean {
  return roundIndex >= joinedAtIndex
}
