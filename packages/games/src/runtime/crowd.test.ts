import { describe, expect, it } from 'vitest'
import { AUDIENCE_BLOC_FRACTION, crowdBloc, crowdChoiceCounts } from './crowd'

describe('crowdBloc (capped, discounted crowd)', () => {
  it('caps the whole crowd at ~half the player votes, split by the crowd choices', () => {
    // 4 player votes -> cap 2. A 100-strong crowd all on 'b' adds at most 2 (not 100).
    const add = crowdBloc(4, new Map([['b', 100]]))
    expect(add.get('b')).toBe(2)
    expect([...add.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2)
  })

  it('distributes the cap across options by the crowd split', () => {
    const add = crowdBloc(4, new Map([['a', 50], ['b', 50]])) // cap 2, 50/50
    expect(add.get('a')).toBe(1)
    expect(add.get('b')).toBe(1)
  })

  it('floors the cap at 1 so a tiny room still feels the crowd', () => {
    expect(crowdBloc(0, new Map([['a', 9]])).get('a')).toBe(1)
    expect(crowdBloc(1, new Map([['a', 9]])).get('a')).toBe(1) // round(0.5)=1 -> floor still 1
  })

  it('an empty / absent crowd changes nothing', () => {
    expect(crowdBloc(5, new Map())).toEqual(new Map())
    expect(crowdBloc(5, new Map([['a', 0]]))).toEqual(new Map())
  })

  it('never lets the crowd overrule the room (cap < player total for any real room)', () => {
    for (const players of [2, 4, 6, 10, 20]) {
      const cap = Math.max(1, Math.round(players * AUDIENCE_BLOC_FRACTION))
      expect(cap).toBeLessThan(players + 1) // a bloc, not a majority
      const add = crowdBloc(players, new Map([['x', 1000]]))
      expect(add.get('x')).toBeLessThanOrEqual(Math.ceil(players / 2))
    }
  })
})

describe('crowdChoiceCounts', () => {
  it('counts option choices, ignoring blanks', () => {
    const m = new Map<string, { choice?: string }>([
      ['s1', { choice: 'o0' }],
      ['s2', { choice: 'o0' }],
      ['s3', { choice: 'o1' }],
      ['s4', {}],
    ])
    expect(crowdChoiceCounts(m)).toEqual(new Map([['o0', 2], ['o1', 1]]))
  })
  it('handles an absent crowd', () => {
    expect(crowdChoiceCounts(undefined)).toEqual(new Map())
  })
})
