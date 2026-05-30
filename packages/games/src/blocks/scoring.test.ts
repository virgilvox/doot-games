import { describe, expect, it } from 'vitest'
import {
  closenessToHalf,
  pityPoints,
  roundMultiplier,
  speedDecay,
  splitPoints,
  sweepBonus,
  voteSharePoints,
} from './scoring'

describe('voteSharePoints', () => {
  it('scales points by share of the vote', () => {
    expect(voteSharePoints(3, 5, 1000)).toBe(600)
    expect(voteSharePoints(5, 5, 1000)).toBe(1000)
    expect(voteSharePoints(0, 5)).toBe(0)
    expect(voteSharePoints(2, 0)).toBe(0) // no votes cast
  })
})

describe('roundMultiplier', () => {
  it('doubles the final round only', () => {
    expect(roundMultiplier(0, 3)).toBe(1)
    expect(roundMultiplier(2, 3)).toBe(2)
    expect(roundMultiplier(0, 1)).toBe(1) // a single-round game is never doubled
  })
})

describe('sweepBonus', () => {
  it('rewards taking every vote in a contested round', () => {
    expect(sweepBonus(4, 4)).toBe(500)
    expect(sweepBonus(3, 4)).toBe(0)
    expect(sweepBonus(1, 1)).toBe(0) // a single voter is not a sweep
  })
})

describe('pityPoints', () => {
  it('floors a contributor who drew no votes', () => {
    expect(pityPoints(0)).toBe(100)
    expect(pityPoints(2)).toBe(0)
  })
})

describe('closenessToHalf / splitPoints (Split the Room)', () => {
  it('peaks at a perfect split and bottoms out at unanimous', () => {
    expect(closenessToHalf(5, 10)).toBe(1) // dead even
    expect(closenessToHalf(0, 10)).toBe(0) // unanimous
    expect(closenessToHalf(10, 10)).toBe(0)
  })
  it("rewards a closer split more (the wiki's 3/7 beats 1/7)", () => {
    expect(closenessToHalf(3, 7)).toBeGreaterThan(closenessToHalf(1, 7))
  })
  it('maps to points', () => {
    expect(splitPoints(5, 10, 1000)).toBe(1000)
    expect(splitPoints(0, 10, 1000)).toBe(0)
  })
})

describe('speedDecay (Kahoot)', () => {
  it("matches Kahoot's documented values on a 30s question", () => {
    expect(speedDecay(2, 30, 1000)).toBe(967)
    expect(speedDecay(10, 30, 1000)).toBe(833)
    expect(speedDecay(20, 30, 1000)).toBe(667)
    expect(speedDecay(30, 30, 1000)).toBe(500) // never below half for a correct answer
  })
  it('gives full points with no timer', () => {
    expect(speedDecay(5, 0, 1000)).toBe(1000)
  })
})
