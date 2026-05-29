/**
 * The standard room state machine. Every game uses the same top-level flow, so
 * the engine owns it and games never reimplement it (PRD section 7.3):
 *
 *   lobby
 *     -> active
 *          for each round: ready -> open -> locked -> reveal
 *     -> results
 *
 * The host triggers each transition. These functions are pure: deadlines (which
 * depend on the wall clock) are passed in, never read here, so the machine is
 * fully deterministic and unit-testable.
 */
import type { RoomState } from './types'

export const INITIAL_STATE: RoomState = {
  phase: 'lobby',
  round: { index: 0, state: 'ready', deadline: null },
}

export type HostAction =
  | { type: 'start' }
  /** Open voting. `deadline` is epoch ms for a timed round, or null/omitted. */
  | { type: 'open'; deadline?: number | null }
  | { type: 'lock' }
  | { type: 'reveal' }
  /** Advance to the next round. `roundCount` is the total number of rounds. */
  | { type: 'next'; roundCount: number }
  | { type: 'finish' }

export type HostActionType = HostAction['type']

/** Whether `action` is legal from `state`. The host UI only offers legal actions. */
export function canTransition(state: RoomState, action: HostAction): boolean {
  const { phase, round } = state
  switch (action.type) {
    case 'start':
      return phase === 'lobby'
    case 'open':
      return phase === 'active' && round.state === 'ready'
    case 'lock':
      return phase === 'active' && round.state === 'open'
    case 'reveal':
      return phase === 'active' && round.state === 'locked'
    case 'next':
      return phase === 'active' && round.state === 'reveal' && round.index < action.roundCount - 1
    case 'finish':
      // The host may end the game from any point in the active phase.
      return phase === 'active'
    default:
      return false
  }
}

/**
 * Compute the next state. Throws `RangeError` on an illegal transition — callers
 * should gate with {@link canTransition}. Returns a new object; never mutates.
 */
export function reduce(state: RoomState, action: HostAction): RoomState {
  if (!canTransition(state, action)) {
    throw new RangeError(
      `Illegal transition: ${action.type} from phase=${state.phase} roundState=${state.round.state}`,
    )
  }
  switch (action.type) {
    case 'start':
      return { phase: 'active', round: { index: 0, state: 'ready', deadline: null } }
    case 'open':
      return {
        phase: 'active',
        round: { ...state.round, state: 'open', deadline: action.deadline ?? null },
      }
    case 'lock':
      return { phase: 'active', round: { ...state.round, state: 'locked', deadline: null } }
    case 'reveal':
      return { phase: 'active', round: { ...state.round, state: 'reveal' } }
    case 'next':
      return {
        phase: 'active',
        round: { index: state.round.index + 1, state: 'ready', deadline: null },
      }
    case 'finish':
      return { phase: 'results', round: { ...state.round } }
  }
}

/** True once the deadline has passed; the host auto-locks an open, timed round. */
export function shouldAutoLock(state: RoomState, now: number): boolean {
  return (
    state.phase === 'active' &&
    state.round.state === 'open' &&
    state.round.deadline !== null &&
    now >= state.round.deadline
  )
}
