import { describe, expect, it } from 'vitest'
import {
  type TierItem,
  type TierPlacements,
  boardByTier,
  consensusBoard,
  itemConsensus,
  mostDivisive,
  playerBoardScore,
  standout,
  tallyItem,
  tierProximity,
} from './logic'

const ITEMS: TierItem[] = [
  { id: 'pizza', label: 'Pizza' },
  { id: 'tacos', label: 'Tacos' },
  { id: 'kale', label: 'Kale' },
]
// 5 tiers: S(0) A(1) B(2) C(3) D(4)

describe('tallyItem', () => {
  it('counts votes per tier and ignores out-of-range / missing', () => {
    const placements: TierPlacements[] = [{ pizza: 0 }, { pizza: 0 }, { pizza: 2 }, { pizza: 9 }, { tacos: 1 }]
    expect(tallyItem('pizza', 5, placements)).toEqual([2, 0, 1, 0, 0])
  })
})

describe('itemConsensus', () => {
  it('places an item in its modal tier with agreement + controversy', () => {
    const placements: TierPlacements[] = [{ pizza: 0 }, { pizza: 0 }, { pizza: 0 }, { pizza: 1 }]
    const c = itemConsensus(ITEMS[0]!, 5, placements)
    expect(c.tier).toBe(0)
    expect(c.agreement).toBeCloseTo(0.75)
    expect(c.controversy).toBeCloseTo(0.25)
    expect(c.total).toBe(4)
  })
  it('breaks a modal tie toward the higher tier (lower index)', () => {
    const placements: TierPlacements[] = [{ pizza: 0 }, { pizza: 3 }]
    expect(itemConsensus(ITEMS[0]!, 5, placements).tier).toBe(0)
  })
  it('is unanimous when everyone agrees', () => {
    const placements: TierPlacements[] = [{ kale: 4 }, { kale: 4 }, { kale: 4 }]
    const c = itemConsensus(ITEMS[2]!, 5, placements)
    expect(c.tier).toBe(4)
    expect(c.agreement).toBe(1)
    expect(c.controversy).toBe(0)
  })
  it('returns tier -1 for an item nobody placed', () => {
    expect(itemConsensus(ITEMS[0]!, 5, [{ tacos: 1 }]).tier).toBe(-1)
  })
})

describe('consensusBoard / boardByTier', () => {
  it('builds a board and groups it into lanes + an unplaced tray', () => {
    const placements: TierPlacements[] = [
      { pizza: 0, tacos: 1 },
      { pizza: 0, tacos: 2 },
    ]
    const board = consensusBoard(ITEMS, 5, placements)
    const { lanes, unplaced } = boardByTier(board, 5)
    expect(lanes[0]?.map((c) => c.id)).toEqual(['pizza'])
    expect(lanes[1]?.map((c) => c.id)).toEqual(['tacos']) // tie 1 vs 2 -> higher tier (1)
    expect(unplaced.map((c) => c.id)).toEqual(['kale']) // never placed
  })
  it('survives an empty room without throwing', () => {
    const board = consensusBoard(ITEMS, 5, [])
    expect(board.every((c) => c.tier === -1)).toBe(true)
    expect(boardByTier(board, 5).unplaced).toHaveLength(3)
  })
})

describe('tierProximity', () => {
  it('rewards exact, half-rewards off-by-one, zero beyond', () => {
    expect(tierProximity(2, 2)).toBe(1)
    expect(tierProximity(1, 2)).toBe(0.5)
    expect(tierProximity(4, 2)).toBe(0)
    expect(tierProximity(2, -1)).toBe(0) // no consensus
  })
})

describe('playerBoardScore (match-the-crowd)', () => {
  it('normalises a perfect board to 1 and counts hits', () => {
    const placements: TierPlacements[] = [
      { pizza: 0, tacos: 1, kale: 4 },
      { pizza: 0, tacos: 1, kale: 4 },
    ]
    const board = consensusBoard(ITEMS, 5, placements)
    const perfect = playerBoardScore(board, { pizza: 0, tacos: 1, kale: 4 })
    expect(perfect.points).toBe(1)
    expect(perfect.hits).toBe(3)
  })
  it('gives partial credit for near misses and ignores unplaced items', () => {
    const board = consensusBoard(ITEMS, 5, [
      { pizza: 0, tacos: 1, kale: 4 },
      { pizza: 0, tacos: 1, kale: 4 },
    ])
    // exact on pizza (1), off-by-one on tacos (0.5), miss on kale (0): (1+0.5+0)/3
    const s = playerBoardScore(board, { pizza: 0, tacos: 2, kale: 0 })
    expect(s.points).toBeCloseTo(0.5)
    expect(s.hits).toBe(1)
  })
})

describe('awards', () => {
  it('finds the most divisive and the standout', () => {
    const placements: TierPlacements[] = [
      { pizza: 0, tacos: 0, kale: 4 },
      { pizza: 0, tacos: 4, kale: 4 }, // tacos is split S vs D
      { pizza: 0, tacos: 0, kale: 4 },
    ]
    const board = consensusBoard(ITEMS, 5, placements)
    expect(mostDivisive(board)?.id).toBe('tacos')
    // pizza & kale are both unanimous; standout prefers the higher tier (pizza, S)
    expect(standout(board)?.id).toBe('pizza')
  })
  it('returns null awards for an empty / uncontested room', () => {
    expect(mostDivisive(consensusBoard(ITEMS, 5, []))).toBeNull()
    expect(standout(consensusBoard(ITEMS, 5, []))).toBeNull()
  })
})
