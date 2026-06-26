import { describe, expect, it } from 'vitest'
import { type PlacedItem, TIER_POINTS, leaderboard, resolveItem, tallyVotes } from './logic'

describe('tallyVotes', () => {
  it('counts per tier and drops out-of-range / non-integer votes', () => {
    expect(tallyVotes([0, 0, 2, 5, 1.5, -1], 5)).toEqual([2, 0, 1, 0, 0])
  })
})

describe('resolveItem', () => {
  it('picks the modal tier with agreement', () => {
    const r = resolveItem(new Map([['a', 0], ['b', 0], ['c', 1]]), 5)
    expect(r.tier).toBe(0)
    expect(r.agreement).toBeCloseTo(2 / 3)
    expect(r.total).toBe(3)
  })
  it('breaks ties toward the higher tier (lower index)', () => {
    expect(resolveItem(new Map([['a', 0], ['b', 3]]), 5).tier).toBe(0)
  })
  it('returns -1 when nobody voted', () => {
    expect(resolveItem(new Map(), 5).tier).toBe(-1)
  })
})

describe('leaderboard (match the room)', () => {
  const roster = [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bo' },
    { id: 'c', name: 'Cy' },
  ]
  it('awards full for the consensus tier, half for one off, none for a miss', () => {
    const placed: PlacedItem[] = [
      // consensus S(0): Ann exact, Bo one-off (1), Cy miss (3)
      { index: 0, tier: 0, votes: new Map([['a', 0], ['b', 1], ['c', 3]]) },
    ]
    const board = leaderboard(roster, placed)
    const byName = Object.fromEntries(board.map((r) => [r.name, r.score]))
    expect(byName.Ann).toBe(TIER_POINTS)
    expect(byName.Bo).toBe(Math.round(TIER_POINTS * 0.5))
    expect(byName.Cy).toBe(0)
    expect(board[0]!.name).toBe('Ann') // sorted by score
  })
  it('accumulates across items and counts exact hits', () => {
    const placed: PlacedItem[] = [
      { index: 0, tier: 0, votes: new Map([['a', 0]]) },
      { index: 1, tier: 2, votes: new Map([['a', 2]]) },
    ]
    const ann = leaderboard(roster, placed).find((r) => r.name === 'Ann')!
    expect(ann.score).toBe(TIER_POINTS * 2)
    expect(ann.hits).toBe(2)
  })
  it('ignores an unresolved item (tier -1) and unknown voters', () => {
    const placed: PlacedItem[] = [
      { index: 0, tier: -1, votes: new Map([['a', 0]]) },
      { index: 1, tier: 0, votes: new Map([['zzz', 0]]) },
    ]
    expect(leaderboard(roster, placed).every((r) => r.score === 0)).toBe(true)
  })
})
