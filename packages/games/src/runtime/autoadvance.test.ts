import { describe, expect, it } from 'vitest'
import { isEligible } from '@doot-games/engine'
import {
  type AutoAdvanceState,
  type RoundPlayer,
  initialAutoAdvance,
  resetExpected,
  shouldAutoLock,
  tallyRound,
  trackExpected,
} from './autoadvance'

const players = (...ids: string[]): RoundPlayer[] => ids.map((id) => ({ id, joinedAtIndex: 0 }))
const answered = (...ids: string[]) => (id: string) => ids.includes(id)
const none = () => false

/** One host tick: tally the room, fold it in, and say whether to lock. */
function tick(
  state: AutoAdvanceState,
  roster: RoundPlayer[],
  roundIndex: number,
  hasInput: (id: string) => boolean,
) {
  const tally = tallyRound(roster, roundIndex, hasInput, isEligible)
  const next = trackExpected(state, `${roundIndex}`, tally)
  return { state: next, tally, lock: shouldAutoLock(tally, next.expected) }
}

describe('the common case still closes the round instantly', () => {
  it('locks the moment the last person answers', () => {
    const roster = players('a', 'b', 'c')
    let s = initialAutoAdvance
    let r = tick(s, roster, 0, answered('a', 'b'))
    expect(r.lock).toBe(false)
    s = r.state
    r = tick(s, roster, 0, answered('a', 'b', 'c'))
    expect(r.lock).toBe(true)
  })

  it('never trips on an empty room', () => {
    expect(tick(initialAutoAdvance, [], 0, none).lock).toBe(false)
  })

  it('never trips before anyone has answered', () => {
    expect(tick(initialAutoAdvance, players('a', 'b'), 0, none).lock).toBe(false)
  })
})

describe('a phone that goes quiet must not close the round', () => {
  it('REGRESSION: a sleeping phone no longer shrinks the finish line', () => {
    // Three in the room; two answer. The third puts their phone down to read the
    // question off the big screen, the screen locks, and the heartbeat stops.
    const all = players('a', 'b', 'sleeper')
    let s = trackExpected(initialAutoAdvance, '0', tallyRound(all, 0, none, isEligible))
    expect(s.expected).toBe(3)

    // The roster drops them. This is the exact shape that used to fire.
    const withoutSleeper = players('a', 'b')
    const r = tick(s, withoutSleeper, 0, answered('a', 'b'))
    expect(r.tally.present).toBe(2)
    expect(r.tally.locked).toBe(2)
    expect(r.state.expected).toBe(3) // held, not shrunk
    expect(r.lock).toBe(false) // <- the fix
    s = r.state

    // They wake up and answer. NOW it closes.
    expect(tick(s, players('a', 'b', 'sleeper'), 0, answered('a', 'b', 'sleeper')).lock).toBe(true)
  })

  it('the same shape DID fire under the old presence-derived denominator', () => {
    // The old rule, kept here so the regression cannot come back quietly.
    const oldRule = (roster: RoundPlayer[], has: (id: string) => boolean) => {
      const t = tallyRound(roster, 0, has, isEligible)
      return t.present >= 1 && t.locked >= t.present
    }
    expect(oldRule(players('a', 'b'), answered('a', 'b'))).toBe(true)
  })
})

describe('the expectation is scoped to one round, so it cannot accumulate', () => {
  it('starts each round from whoever is actually there', () => {
    let s = trackExpected(initialAutoAdvance, '0', { locked: 0, present: 9 })
    expect(s.expected).toBe(9)
    // Six of them leave between rounds; the next round expects three, not nine.
    s = trackExpected(s, '1', { locked: 0, present: 3 })
    expect(s.expected).toBe(3)
    expect(shouldAutoLock({ locked: 3, present: 3 }, s.expected)).toBe(true)
  })

  it('someone leaving MID-round blocks only that round', () => {
    let s = trackExpected(initialAutoAdvance, '4', { locked: 0, present: 5 })
    // They walk out; the four who remain all answer.
    expect(shouldAutoLock({ locked: 4, present: 4 }, trackExpected(s, '4', { locked: 4, present: 4 }).expected)).toBe(false)
    // The host taps Lock, and the next round has moved on without them.
    s = trackExpected(s, '5', { locked: 0, present: 4 })
    expect(s.expected).toBe(4)
  })

  it('counts a mid-round joiner, who is eligible from the round they joined', () => {
    const roster: RoundPlayer[] = [
      { id: 'a', joinedAtIndex: 0 },
      { id: 'late', joinedAtIndex: 3 },
    ]
    // Round 3: both are eligible, so both are expected.
    const t3 = tallyRound(roster, 3, answered('a'), isEligible)
    expect(t3).toEqual({ locked: 1, present: 2 })
    expect(shouldAutoLock(t3, trackExpected(initialAutoAdvance, '3', t3).expected)).toBe(false)
  })

  it('ignores a player for rounds that closed before they joined', () => {
    const roster: RoundPlayer[] = [
      { id: 'a', joinedAtIndex: 0 },
      { id: 'late', joinedAtIndex: 3 },
    ]
    // Round 2: the late joiner is not eligible, so `a` alone finishes it.
    const t2 = tallyRound(roster, 2, answered('a'), isEligible)
    expect(t2).toEqual({ locked: 1, present: 1 })
    expect(shouldAutoLock(t2, trackExpected(initialAutoAdvance, '2', t2).expected)).toBe(true)
  })
})

describe('a kick is a fact, not a guess, so it lowers the bar', () => {
  it('recomputes the expectation instead of waiting forever on someone removed', () => {
    let s = trackExpected(initialAutoAdvance, '0', { locked: 0, present: 4 })
    expect(s.expected).toBe(4)
    // The host removes a disruptive player mid-round. Without this the round could
    // never auto-advance, because the high-water still counts them.
    s = resetExpected('0', { locked: 3, present: 3 })
    expect(s.expected).toBe(3)
    expect(shouldAutoLock({ locked: 3, present: 3 }, s.expected)).toBe(true)
  })
})

describe('it costs nothing on a quiet tick', () => {
  it('returns the SAME object when the expectation has not moved', () => {
    // The host calls this 4x a second into a ref. A fresh object each time would
    // mark the control bar dirty and re-render a room where nothing happened.
    const a = trackExpected(initialAutoAdvance, '0', { locked: 0, present: 3 })
    const b = trackExpected(a, '0', { locked: 1, present: 3 })
    const c = trackExpected(b, '0', { locked: 2, present: 2 }) // someone went quiet
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('still returns a new object when the expectation actually grows', () => {
    const a = trackExpected(initialAutoAdvance, '0', { locked: 0, present: 3 })
    const b = trackExpected(a, '0', { locked: 0, present: 5 }) // two more joined
    expect(b).not.toBe(a)
    expect(b.expected).toBe(5)
  })

  it('returns a new object on a new round, even at the same size', () => {
    const a = trackExpected(initialAutoAdvance, '0', { locked: 0, present: 3 })
    const b = trackExpected(a, '1', { locked: 0, present: 3 })
    expect(b).not.toBe(a)
    expect(b.roundKey).toBe('1')
  })
})
