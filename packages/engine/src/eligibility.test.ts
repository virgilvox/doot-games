import { describe, expect, it } from 'vitest'
import { computeJoinedAtIndex, isEligible } from './eligibility'
import type { RoundInfo } from './types'

const round = (index: number, state: RoundInfo['state']): RoundInfo => ({
  index,
  state,
  deadline: null,
})

describe('computeJoinedAtIndex', () => {
  it('makes lobby joiners eligible from round 0', () => {
    expect(computeJoinedAtIndex('lobby', round(0, 'ready'))).toBe(0)
    expect(computeJoinedAtIndex('lobby', round(3, 'open'))).toBe(0)
  })

  it('lets mid-round joiners in on the current round when still ready/open', () => {
    expect(computeJoinedAtIndex('active', round(2, 'ready'))).toBe(2)
    expect(computeJoinedAtIndex('active', round(2, 'open'))).toBe(2)
  })

  it('defers joiners to the next round once voting has closed', () => {
    expect(computeJoinedAtIndex('active', round(2, 'locked'))).toBe(3)
    expect(computeJoinedAtIndex('active', round(2, 'reveal'))).toBe(3)
  })
})

describe('isEligible', () => {
  it('locks earlier rounds and opens the join round onward', () => {
    expect(isEligible(2, 1)).toBe(false)
    expect(isEligible(2, 2)).toBe(true)
    expect(isEligible(2, 5)).toBe(true)
  })
})
