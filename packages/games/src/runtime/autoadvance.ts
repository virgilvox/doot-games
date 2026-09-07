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
  /** Their ids, which is what the expectation actually accumulates. */
  presentIds: string[]
}

/** Carried between ticks. `roundKey` scopes the expectation to a single round. */
export interface AutoAdvanceState {
  roundKey: string
  /**
   * WHO the round is waiting on, not how many.
   *
   * A count cannot tell "their phone went to sleep" from "the host removed them",
   * which left kicks unfixable: recomputing the number inside the click handler
   * reads a roster that has not caught up (the engine refreshes its snapshot on a
   * microtask), so it re-recorded the very number it meant to lower and the round
   * stalled anyway. With ids, a kick removes exactly one entry and nothing has to
   * be timed correctly.
   */
  expected: ReadonlySet<string>
}

export const initialAutoAdvance: AutoAdvanceState = { roundKey: '', expected: new Set() }

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
  const presentIds: string[] = []
  for (const p of players) {
    if (!isEligible(p.joinedAtIndex, roundIndex)) continue
    presentIds.push(p.id)
    if (hasInput(p.id)) locked++
  }
  return { locked, present: presentIds.length, presentIds }
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
  if (prev.roundKey !== roundKey) return { roundKey, expected: new Set(tally.presentIds) }
  // Return the SAME object when nobody new appeared. The host calls this four
  // times a second into a ref, so a fresh object every tick would mark everything
  // downstream dirty and re-render the control bar in an idle room.
  let grew = false
  for (const id of tally.presentIds) {
    if (!prev.expected.has(id)) {
      grew = true
      break
    }
  }
  if (!grew) return prev
  const expected = new Set(prev.expected)
  for (const id of tally.presentIds) expected.add(id)
  return { roundKey, expected }
}

/**
 * Whether the round should close itself. Needs at least one player, so an empty
 * room never trips it, and every expected answer in.
 */
export function shouldAutoLock(
  expected: ReadonlySet<string>,
  hasInput: (id: string) => boolean,
): boolean {
  if (expected.size === 0) return false
  for (const id of expected) if (!hasInput(id)) return false
  return true
}

/**
 * Stop waiting on one player. The host KICKING someone is the one case where the
 * roster shrinking is a fact rather than a guess. Removing them BY ID needs no
 * knowledge of when the roster refreshes, which is exactly why this takes a pid
 * rather than a fresh tally.
 */
export function forgetPlayer(prev: AutoAdvanceState, pid: string): AutoAdvanceState {
  if (!prev.expected.has(pid)) return prev
  const expected = new Set(prev.expected)
  expected.delete(pid)
  return { roundKey: prev.roundKey, expected }
}

/** How many answers the round is waiting for, for display. */
export function expectedCount(state: AutoAdvanceState, tally: RoundTally): number {
  return Math.max(state.expected.size, tally.present)
}
