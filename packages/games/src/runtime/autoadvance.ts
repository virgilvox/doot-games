/**
 * When a round has enough answers to close itself.
 *
 * Auto-advance exists to remove dead air: the moment everyone has answered, stop
 * waiting. The danger is the other side of that trade. The count it compares
 * against came straight from presence, and presence is a guess made from
 * heartbeats, so a phone whose screen locked stopped beating, dropped off the
 * roster, and SHRANK the denominator until `locked === total` was true. The round
 * closed while its owner was still reading the question off the big screen, and
 * they came back to "Time!".
 *
 * That bias is backwards. Being wrong about someone who left costs a few seconds
 * of dead air that the host can end with one tap. Being wrong about someone who
 * is still playing costs them the question. So presence is still allowed to say
 * who is in the room when a round OPENS, and is no longer allowed to take anyone
 * away while it is running:
 *
 *   expected = the high-water mark of eligible players seen during THIS round
 *
 * Scoping the high-water to one round is what keeps it honest. Someone who left
 * earlier is already absent when the round opens, so they are never counted.
 * Someone who leaves mid-round blocks auto-advance for that one round, the host
 * taps Lock, and the next round starts without them. The failure is bounded and
 * self-healing, which the old one was not.
 */

/** The slice of a player this decision needs. */
export interface RoundPlayer {
  id: string
  joinedAtIndex: number
}

/** What the room looks like for one round, right now. */
export interface RoundTally {
  /** Eligible players who have submitted an answer for this round. */
  locked: number
  /** Eligible players the roster currently shows (a presence guess). */
  present: number
}

/** Carried between ticks. `roundKey` scopes the high-water to a single round. */
export interface AutoAdvanceState {
  roundKey: string
  expected: number
}

export const initialAutoAdvance: AutoAdvanceState = { roundKey: '', expected: 0 }

/**
 * Count this round's eligible players and how many have answered. `isEligible` is
 * passed in so this module does not depend on the engine.
 */
export function tallyRound(
  players: readonly RoundPlayer[],
  roundIndex: number,
  hasInput: (id: string) => boolean,
  isEligible: (joinedAtIndex: number, roundIndex: number) => boolean,
): RoundTally {
  let locked = 0
  let present = 0
  for (const p of players) {
    if (!isEligible(p.joinedAtIndex, roundIndex)) continue
    present++
    if (hasInput(p.id)) locked++
  }
  return { locked, present }
}

/**
 * Fold this tick's tally into the round's expectation. A new round starts from
 * whoever is present; within a round the number only ever grows, so a phone going
 * quiet can never pull the finish line closer.
 */
export function trackExpected(
  prev: AutoAdvanceState,
  roundKey: string,
  tally: RoundTally,
): AutoAdvanceState {
  if (prev.roundKey !== roundKey) return { roundKey, expected: tally.present }
  // Return the SAME object when nothing changed. The host calls this four times a
  // second and stores the result in a ref, so handing back a fresh object every
  // tick would mark everything downstream dirty and re-render the control bar
  // continuously in a room where nothing is happening.
  if (tally.present <= prev.expected) return prev
  return { roundKey, expected: tally.present }
}

/**
 * Whether the round should close itself. Needs at least one player, so an empty
 * room never trips it, and every expected answer in.
 */
export function shouldAutoLock(tally: RoundTally, expected: number): boolean {
  return expected >= 1 && tally.locked >= expected
}

/**
 * Recompute the expectation from scratch. The host KICKING someone is the one
 * case where the roster shrinking is a fact rather than a guess, so the
 * high-water has to come down with it or that round could never auto-advance.
 */
export function resetExpected(roundKey: string, tally: RoundTally): AutoAdvanceState {
  return { roundKey, expected: tally.present }
}
