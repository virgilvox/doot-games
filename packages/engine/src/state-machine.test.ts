import { describe, expect, it } from 'vitest'
import {
  type HostAction,
  INITIAL_STATE,
  canTransition,
  reduce,
  shouldAutoLock,
} from './state-machine'
import type { RoomState } from './types'

const active = (index: number, state: RoomState['round']['state'], deadline: number | null = null): RoomState => ({
  phase: 'active',
  round: { index, state, deadline },
})

describe('state machine happy path', () => {
  it('walks lobby -> active -> round cycle -> next -> results', () => {
    let s = INITIAL_STATE
    expect(s.phase).toBe('lobby')

    s = reduce(s, { type: 'start' })
    expect(s).toEqual(active(0, 'ready'))

    s = reduce(s, { type: 'open', deadline: 1000 })
    expect(s.round).toEqual({ index: 0, state: 'open', deadline: 1000 })

    s = reduce(s, { type: 'lock' })
    expect(s.round).toEqual({ index: 0, state: 'locked', deadline: null })

    s = reduce(s, { type: 'reveal' })
    expect(s.round.state).toBe('reveal')

    s = reduce(s, { type: 'next', roundCount: 2 })
    expect(s.round).toEqual({ index: 1, state: 'ready', deadline: null })

    // last round -> finish
    s = reduce(s, { type: 'open' })
    s = reduce(s, { type: 'lock' })
    s = reduce(s, { type: 'reveal' })
    s = reduce(s, { type: 'finish' })
    expect(s.phase).toBe('results')
  })

  it('open without a deadline yields a null deadline', () => {
    const s = reduce(active(0, 'ready'), { type: 'open' })
    expect(s.round.deadline).toBeNull()
  })
})

describe('canTransition gating', () => {
  it('only allows start from lobby', () => {
    expect(canTransition(INITIAL_STATE, { type: 'start' })).toBe(true)
    expect(canTransition(active(0, 'ready'), { type: 'start' })).toBe(false)
  })

  it('only allows open from ready, lock from open, reveal from locked', () => {
    expect(canTransition(active(0, 'ready'), { type: 'open' })).toBe(true)
    expect(canTransition(active(0, 'open'), { type: 'open' })).toBe(false)
    expect(canTransition(active(0, 'open'), { type: 'lock' })).toBe(true)
    expect(canTransition(active(0, 'ready'), { type: 'lock' })).toBe(false)
    expect(canTransition(active(0, 'locked'), { type: 'reveal' })).toBe(true)
    expect(canTransition(active(0, 'open'), { type: 'reveal' })).toBe(false)
  })

  it('only allows next from reveal when more rounds remain', () => {
    expect(canTransition(active(0, 'reveal'), { type: 'next', roundCount: 2 })).toBe(true)
    expect(canTransition(active(1, 'reveal'), { type: 'next', roundCount: 2 })).toBe(false)
    expect(canTransition(active(0, 'locked'), { type: 'next', roundCount: 2 })).toBe(false)
  })

  it('allows finish from anywhere in active, never from lobby/results', () => {
    expect(canTransition(active(0, 'ready'), { type: 'finish' })).toBe(true)
    expect(canTransition(active(0, 'reveal'), { type: 'finish' })).toBe(true)
    expect(canTransition(INITIAL_STATE, { type: 'finish' })).toBe(false)
    expect(canTransition({ phase: 'results', round: { index: 0, state: 'reveal', deadline: null } }, { type: 'finish' })).toBe(false)
  })
})

describe('reduce rejects illegal transitions', () => {
  const illegal: Array<[RoomState, HostAction]> = [
    [INITIAL_STATE, { type: 'open' }],
    [INITIAL_STATE, { type: 'lock' }],
    [active(0, 'ready'), { type: 'reveal' }],
    [active(1, 'reveal'), { type: 'next', roundCount: 2 }],
  ]
  for (const [state, action] of illegal) {
    it(`throws on ${action.type} from ${state.phase}/${state.round.state}`, () => {
      expect(() => reduce(state, action)).toThrow(RangeError)
    })
  }

  it('never mutates the input state', () => {
    const s = active(0, 'ready')
    const frozen = structuredClone(s)
    reduce(s, { type: 'open', deadline: 5 })
    expect(s).toEqual(frozen)
  })
})

describe('shouldAutoLock', () => {
  it('locks an open timed round once the deadline passes', () => {
    expect(shouldAutoLock(active(0, 'open', 1000), 1000)).toBe(true)
    expect(shouldAutoLock(active(0, 'open', 1000), 1001)).toBe(true)
    expect(shouldAutoLock(active(0, 'open', 1000), 999)).toBe(false)
  })

  it('does not lock untimed or non-open rounds', () => {
    expect(shouldAutoLock(active(0, 'open', null), 9e9)).toBe(false)
    expect(shouldAutoLock(active(0, 'ready', 1000), 2000)).toBe(false)
    expect(shouldAutoLock({ phase: 'lobby', round: { index: 0, state: 'open', deadline: 1 } }, 2)).toBe(false)
  })
})
