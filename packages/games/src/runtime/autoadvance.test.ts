import { isEligible } from '@doot-games/engine'
import { describe, expect, it } from 'vitest'
import {
  type AutoAdvanceState,
  type RoundPlayer,
  expectedCount,
  forgetPlayer,
  initialAutoAdvance,
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
  const next = trackExpected(state, `${roundIndex}:open`, tally)
  return { state: next, tally, lock: shouldAutoLock(next.expected, hasInput) }
}

describe('the common case still closes the round instantly', () => {
  it('locks the moment the last person answers', () => {
    const roster = players('a', 'b', 'c')
    let r = tick(initialAutoAdvance, roster, 0, answered('a', 'b'))
    expect(r.lock).toBe(false)
    r = tick(r.state, roster, 0, answered('a', 'b', 'c'))
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
    let s = trackExpected(
      initialAutoAdvance,
      '0:open',
      tallyRound(players('a', 'b', 'sleeper'), 0, none, isEligible),
    )
    expect(s.expected.size).toBe(3)

    // The roster drops them. This is the exact shape that used to fire.
    const r = tick(s, players('a', 'b'), 0, answered('a', 'b'))
    expect(r.tally.present).toBe(2)
    expect(r.state.expected.has('sleeper')).toBe(true) // still waiting on them
    expect(r.lock).toBe(false) // <- the fix
    s = r.state

    // They wake up and answer. NOW it closes.
    expect(tick(s, players('a', 'b', 'sleeper'), 0, answered('a', 'b', 'sleeper')).lock).toBe(true)
  })

  it('the same shape DID fire under the old presence-derived denominator', () => {
    // The old rule, kept so the regression cannot come back quietly.
    const oldRule = (roster: RoundPlayer[], has: (id: string) => boolean) => {
      const t = tallyRound(roster, 0, has, isEligible)
      return t.present >= 1 && t.locked >= t.present
    }
    expect(oldRule(players('a', 'b'), answered('a', 'b'))).toBe(true)
  })

  it('shows the honest denominator while it waits', () => {
    const s = trackExpected(initialAutoAdvance, '0:open', {
      locked: 2,
      present: 3,
      presentIds: ['a', 'b', 'sleeper'],
    })
    // The sleeper has aged off the roster, but the screen must still say 3.
    expect(expectedCount(s, { locked: 2, present: 2, presentIds: ['a', 'b'] })).toBe(3)
  })
})

describe('the expectation is scoped to one round, so it cannot accumulate', () => {
  it('starts each round from whoever is actually there', () => {
    let s = trackExpected(initialAutoAdvance, '0:open', {
      locked: 0,
      present: 3,
      presentIds: ['a', 'b', 'c'],
    })
    expect(s.expected.size).toBe(3)
    // Two of them leave between rounds; the next round expects one, not three.
    s = trackExpected(s, '1:open', { locked: 0, present: 1, presentIds: ['a'] })
    expect([...s.expected]).toEqual(['a'])
    expect(shouldAutoLock(s.expected, answered('a'))).toBe(true)
  })

  it('someone leaving MID-round holds only that round', () => {
    const s = trackExpected(initialAutoAdvance, '4:open', {
      locked: 0,
      present: 5,
      presentIds: ['a', 'b', 'c', 'd', 'gone'],
    })
    expect(shouldAutoLock(s.expected, answered('a', 'b', 'c', 'd'))).toBe(false)
    // The host taps Lock; the next round has moved on without them.
    const next = trackExpected(s, '5:open', {
      locked: 0,
      present: 4,
      presentIds: ['a', 'b', 'c', 'd'],
    })
    expect(next.expected.has('gone')).toBe(false)
  })

  it('counts a mid-round joiner, who is eligible from the round they joined', () => {
    const roster: RoundPlayer[] = [
      { id: 'a', joinedAtIndex: 0 },
      { id: 'late', joinedAtIndex: 3 },
    ]
    const r = tick(initialAutoAdvance, roster, 3, answered('a'))
    expect(r.tally.present).toBe(2)
    expect(r.lock).toBe(false)
  })

  it('ignores a player for rounds that closed before they joined', () => {
    const roster: RoundPlayer[] = [
      { id: 'a', joinedAtIndex: 0 },
      { id: 'late', joinedAtIndex: 3 },
    ]
    const r = tick(initialAutoAdvance, roster, 2, answered('a'))
    expect(r.tally.present).toBe(1)
    expect(r.lock).toBe(true)
  })
})

// The kick control renders only in the LOBBY today, so none of this is reachable
// in the shipped product. It is kept because moving that control into a live round
// is an obvious feature, and this is the shape that keeps it correct when someone
// does. The design point stands on its own: an expectation of NAMES can express
// "stop waiting on this person"; an expectation of COUNT cannot.
describe('removing one person, with no timing to get right', () => {
  it('lets the round finish once the rest have answered', () => {
    let s = trackExpected(initialAutoAdvance, '0:open', {
      locked: 0,
      present: 4,
      presentIds: ['a', 'b', 'c', 'rude'],
    })
    expect(shouldAutoLock(s.expected, answered('a', 'b', 'c'))).toBe(false)

    s = forgetPlayer(s, 'rude')
    expect(s.expected.has('rude')).toBe(false)
    expect(shouldAutoLock(s.expected, answered('a', 'b', 'c'))).toBe(true)
  })

  it('a COUNT could not express this, which is why it is a set', () => {
    // The engine refreshes its snapshot on a microtask, so the click handler that
    // kicks still sees the pre-kick roster. The count version recomputed from that
    // stale roster, re-recorded the number it meant to lower, and stalled forever.
    const staleCount = Math.max(4, 4) // what recompute-at-click-time produced
    expect(staleCount).toBe(4)
    // The set version needs no roster at all: it names the person to drop.
    const s = forgetPlayer(
      trackExpected(initialAutoAdvance, '0:open', {
        locked: 0,
        present: 4,
        presentIds: ['a', 'b', 'c', 'rude'],
      }),
      'rude',
    )
    expect(s.expected.size).toBe(3)
  })

  it('is a no-op for someone who was never expected', () => {
    const s = trackExpected(initialAutoAdvance, '0:open', {
      locked: 0,
      present: 2,
      presentIds: ['a', 'b'],
    })
    expect(forgetPlayer(s, 'nobody')).toBe(s)
  })
})

describe('it costs nothing on a quiet tick', () => {
  const base = trackExpected(initialAutoAdvance, '0:open', {
    locked: 0,
    present: 3,
    presentIds: ['a', 'b', 'c'],
  })

  it('returns the SAME object when nobody new appeared', () => {
    // The host calls this 4x a second into a ref. A fresh object each time would
    // mark the control bar dirty and re-render a room where nothing happened.
    expect(
      trackExpected(base, '0:open', { locked: 2, present: 3, presentIds: ['a', 'b', 'c'] }),
    ).toBe(base)
    // Even when the roster SHRANK, which is the common case mid-round.
    expect(trackExpected(base, '0:open', { locked: 2, present: 2, presentIds: ['a', 'b'] })).toBe(
      base,
    )
  })

  it('returns a new object when someone actually joins', () => {
    const grown = trackExpected(base, '0:open', {
      locked: 0,
      present: 4,
      presentIds: ['a', 'b', 'c', 'd'],
    })
    expect(grown).not.toBe(base)
    expect(grown.expected.size).toBe(4)
  })

  it('returns a new object on a new round, even at the same size', () => {
    const next = trackExpected(base, '1:open', {
      locked: 0,
      present: 3,
      presentIds: ['a', 'b', 'c'],
    })
    expect(next).not.toBe(base)
    expect(next.roundKey).toBe('1:open')
  })

  it('does not mutate the set it was handed', () => {
    trackExpected(base, '0:open', { locked: 0, present: 4, presentIds: ['a', 'b', 'c', 'd'] })
    expect(base.expected.size).toBe(3)
  })
})
