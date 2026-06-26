import type { ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type TierContent, type TierInput, tierBlock } from './block'
import {
  type TierItem,
  type TierPlacements,
  boardByTier,
  consensusBoard,
  itemConsensus,
  mostDivisive,
  playerBoardScore,
  runningLeaderboard,
  standout,
  tallyItem,
  textOn,
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

// ── the block contract: aggregate / revealSummary / isComplete ──────────────────
function content(over: Partial<TierContent> = {}): TierContent {
  return {
    ...tierBlock.defaultContent(),
    tiers: [
      { label: 'S', color: '#f00' },
      { label: 'A', color: '#fa0' },
      { label: 'B', color: '#ff0' },
    ],
    items: [
      { id: 'pizza', label: 'Pizza', image: '' },
      { id: 'kale', label: 'Kale', image: '' },
    ],
    ...over,
  }
}
const PLAYERS: ScorePlayer[] = [
  { id: 'a', name: 'Ann', joinedAtIndex: 0 },
  { id: 'b', name: 'Bo', joinedAtIndex: 0 },
  { id: 'c', name: 'Cy', joinedAtIndex: 0 },
]
// pizza: 2 in S, 1 in A (modal S, divisive); kale: unanimous B.
const INPUTS = new Map<string, TierInput>([
  ['a', { placements: { pizza: 0, kale: 2 } }],
  ['b', { placements: { pizza: 0, kale: 2 } }],
  ['c', { placements: { pizza: 1, kale: 2 } }],
])
const ctx = (over: Partial<TierContent> = {}, inputs = INPUTS) => ({
  rounds: [{ index: 0, content: content(over) }],
  inputsFor: () => inputs,
  answerFor: () => null,
  players: PLAYERS,
})

describe('tier block aggregate', () => {
  it('builds the board as a distribution + crown/divisive awards, no leaderboard when unscored', () => {
    const frag = tierBlock.aggregate!(ctx())
    expect(frag.leaderboard).toBeUndefined()
    const bars = frag.distributions?.[0]?.bars ?? []
    // top tier first; display is the band label; count = tierCount - tierIndex
    expect(bars.map((b) => `${b.label}:${b.display}:${b.count}`)).toEqual(['Pizza:S:3', 'Kale:B:1'])
    const awards = Object.fromEntries((frag.awards ?? []).map((a) => [a.subject, a.label]))
    expect(awards.Kale).toMatch(/Room agrees: B/) // unanimous standout
    expect(awards.Pizza).toBe('Most divisive') // the split item, distinct from the crown
  })

  it('scores "match the room" when scored, with partial credit for off-by-one', () => {
    const frag = tierBlock.aggregate!(ctx({ scored: true }))
    const byName = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    // consensus: pizza=S(0), kale=B(2). a,b match both -> full; c off-by-one on pizza -> 0.75
    expect(byName.Ann).toBe(byName.Bo)
    expect(byName.Ann).toBeGreaterThan(byName.Cy)
    expect(byName.Cy).toBe(Math.round(byName.Ann * 0.75))
    expect((frag.leaderboard ?? [])[0]?.detail).toBe('2 matched')
  })

  it('accumulates the leaderboard across multiple tier rounds', () => {
    const one = content({ scored: true })
    const frag = tierBlock.aggregate!({
      rounds: [
        { index: 0, content: one },
        { index: 1, content: one },
      ],
      inputsFor: () => INPUTS,
      answerFor: () => null,
      players: PLAYERS,
    })
    const single = tierBlock.aggregate!(ctx({ scored: true }))
    const ann2 = (frag.leaderboard ?? []).find((e) => e.name === 'Ann')?.score ?? 0
    const ann1 = (single.leaderboard ?? []).find((e) => e.name === 'Ann')?.score ?? 0
    expect(ann2).toBe(ann1 * 2)
  })

  it('does not score players for rounds before they joined', () => {
    const late: ScorePlayer[] = [{ id: 'a', name: 'Ann', joinedAtIndex: 1 }] // joined after round 0
    const frag = tierBlock.aggregate!({
      rounds: [{ index: 0, content: content({ scored: true }) }],
      inputsFor: () => new Map([['a', { placements: { pizza: 0, kale: 2 } }]]),
      answerFor: () => null,
      players: late,
    })
    // a perfect board but ineligible round -> 0 -> no leaderboard surfaces
    expect(frag.leaderboard).toBeUndefined()
  })

  it('handles an empty room (no inputs) without a board or a crash', () => {
    const frag = tierBlock.aggregate!(ctx({}, new Map()))
    expect(frag.distributions ?? []).toHaveLength(0)
    expect(frag.awards ?? []).toHaveLength(0)
  })
})

describe('runningLeaderboard (item-by-item match the room)', () => {
  const roster = [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bo' },
  ]
  it('awards full for the consensus tier, half for one off, accumulates + sorts', () => {
    const placed = [
      { tier: 0, votes: new Map([['a', 0], ['b', 1]]) }, // Ann exact, Bo one-off
      { tier: 2, votes: new Map([['a', 2], ['b', 4]]) }, // Ann exact, Bo miss
    ]
    const lb = runningLeaderboard(roster, placed, 1000)
    const byName = Object.fromEntries(lb.map((r) => [r.name, r.score]))
    expect(byName.Ann).toBe(2000) // two exact
    expect(byName.Bo).toBe(500) // one off-by-one
    expect(lb[0]!.name).toBe('Ann')
    expect(lb.find((r) => r.name === 'Ann')!.hits).toBe(2)
  })
  it('skips unresolved items and unknown voters', () => {
    const lb = runningLeaderboard(roster, [
      { tier: -1, votes: new Map([['a', 0]]) },
      { tier: 0, votes: new Map([['zzz', 0]]) },
    ])
    expect(lb.every((r) => r.score === 0)).toBe(true)
  })
})

describe('textOn (label contrast)', () => {
  it('keeps dark text on the pastel default bands and flips to white on dark colors', () => {
    expect(textOn('#ffd43b')).toBe('#1a1a1a') // yellow B
    expect(textOn('#ff6b6b')).toBe('#1a1a1a') // red S
    expect(textOn('#1a2a4a')).toBe('#ffffff') // a dark navy a user might pick
    expect(textOn('#000000')).toBe('#ffffff')
  })
  it('handles 3-digit shorthand hex', () => {
    expect(textOn('#000')).toBe('#ffffff') // black shorthand -> white text
    expect(textOn('#fff')).toBe('#1a1a1a') // white shorthand -> dark text
  })
  it('falls back to dark for a non-hex / empty color', () => {
    expect(textOn('var(--primary)')).toBe('#1a1a1a')
    expect(textOn('')).toBe('#1a1a1a')
  })
})

describe('tier content schema', () => {
  it('rejects duplicate item ids (which would merge votes + collide list keys)', () => {
    const dup = tierBlock.contentSchema.safeParse({
      prompt: 'x',
      items: [
        { id: 'same', label: 'A', image: '' },
        { id: 'same', label: 'B', image: '' },
      ],
    })
    expect(dup.success).toBe(false)
  })
  it('accepts a board with unique ids (defaults fill the rest)', () => {
    const okParse = tierBlock.contentSchema.safeParse({
      prompt: 'x',
      items: [
        { id: 'a', label: 'A', image: '' },
        { id: 'b', label: 'B', image: '' },
      ],
    })
    expect(okParse.success).toBe(true)
  })
})

describe('tier block revealSummary + isComplete', () => {
  it('reveals the consensus tier per item', () => {
    const summary = tierBlock.revealSummary!({ content: content(), inputs: INPUTS, answer: null, players: PLAYERS })
    expect(summary.tiers.map((t) => t.label)).toEqual(['S', 'A', 'B'])
    expect(summary.board.find((b) => b.id === 'kale')?.tier).toBe(2)
    expect(summary.board.find((b) => b.id === 'pizza')?.tier).toBe(0)
  })
  it('is complete only when every item is placed', () => {
    const c = content()
    expect(tierBlock.isComplete!(c, { placements: { pizza: 0, kale: 2 } })).toBe(true)
    expect(tierBlock.isComplete!(c, { placements: { pizza: 0 } })).toBe(false)
    expect(tierBlock.isComplete!(c, { placements: {} })).toBe(false)
  })
})
