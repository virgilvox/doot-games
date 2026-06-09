import { describe, expect, it } from 'vitest'
import {
  BINGO_PACKS,
  type BingoCard,
  bingoLeaderboard,
  buildCard,
  callOrder,
  cellsNeeded,
  completedLines,
  freeIndex,
  hasBingo,
  isCovered,
  lines,
  placePoints,
  verifyClaim,
} from './logic'

const POOL = Array.from({ length: 40 }, (_, i) => `item-${i}`)

describe('buildCard', () => {
  it('is deterministic and reconnect-safe: same room + pid re-deals the identical card', () => {
    const a = buildCard('ROOM', 'p_alice', POOL, 5)
    const b = buildCard('ROOM', 'p_alice', POOL, 5)
    expect(b).toEqual(a)
  })

  it('deals different players different cards in the same room', () => {
    const a = buildCard('ROOM', 'p_alice', POOL, 5)
    const b = buildCard('ROOM', 'p_bob', POOL, 5)
    expect(a.cells).not.toEqual(b.cells)
  })

  it('changes with the room seed (a new room re-shuffles)', () => {
    const a = buildCard('ROOM', 'p_alice', POOL, 5)
    const b = buildCard('XYZ9', 'p_alice', POOL, 5)
    expect(a.cells).not.toEqual(b.cells)
  })

  it('fills size*size cells with a free center on odd sizes', () => {
    for (const size of [3, 5] as const) {
      const c = buildCard('ROOM', 'p_a', POOL, size)
      expect(c.cells).toHaveLength(size * size)
      expect(c.free).toBe(true)
      expect(c.cells[freeIndex(size)!]).toBe('')
    }
  })

  it('has no free center on even sizes and fills every cell', () => {
    const c = buildCard('ROOM', 'p_a', POOL, 4)
    expect(c.free).toBe(false)
    expect(c.cells.every((x) => x !== '')).toBe(true)
    expect(c.cells).toHaveLength(16)
  })

  it('deals only distinct items (no repeats on a card)', () => {
    const c = buildCard('ROOM', 'p_a', POOL, 5)
    const items = c.cells.filter((x) => x !== '')
    expect(new Set(items).size).toBe(items.length)
    expect(items.length).toBe(cellsNeeded(5))
  })
})

describe('lines + coverage', () => {
  it('produces 2*size + 2 winning lines', () => {
    expect(lines(5)).toHaveLength(12)
    expect(lines(3)).toHaveLength(8)
  })

  it('treats the free center as covered, an uncalled cell as not', () => {
    const c = buildCard('ROOM', 'p_a', POOL, 5)
    expect(isCovered(c, freeIndex(5)!, new Set())).toBe(true)
    const firstItemCell = c.cells.findIndex((x) => x !== '')
    expect(isCovered(c, firstItemCell, new Set())).toBe(false)
    expect(isCovered(c, firstItemCell, new Set([c.cells[firstItemCell]!]))).toBe(true)
  })

  it('never treats a short-pool empty cell as covered, even if the blank is "called"', () => {
    // A 5x5 needs 24 items; give it 5 so most cells are empty placeholders.
    const c = buildCard('ROOM', 'p_a', ['a', 'b', 'c', 'd', 'e'], 5)
    const empties = c.cells.map((x, i) => ({ x, i })).filter(({ x, i }) => x === '' && i !== freeIndex(5))
    expect(empties.length).toBeGreaterThan(0)
    // Calling the empty string must never cover an empty cell, so a short pool can't
    // gift a line through blanks.
    const calledWithBlank = new Set(['a', 'b', 'c', 'd', 'e', ''])
    for (const e of empties) expect(isCovered(c, e.i, calledWithBlank)).toBe(false)
  })
})

describe('hasBingo / completedLines', () => {
  // A hand-built 3x3 card (free center) to exercise win detection precisely.
  const card3: BingoCard = { size: 3, free: true, cells: ['a', 'b', 'c', 'd', '', 'e', 'f', 'g', 'h'] }

  it('detects a completed top row', () => {
    expect(hasBingo(card3, new Set(['a', 'b', 'c']))).toBe(true)
    expect(completedLines(card3, new Set(['a', 'b', 'c']))[0]).toEqual([0, 1, 2])
  })

  it('detects a completed middle column through the free center', () => {
    expect(hasBingo(card3, new Set(['b', 'g']))).toBe(true) // b (top), free, g (bottom)
  })

  it('detects a diagonal through the free center', () => {
    expect(hasBingo(card3, new Set(['a', 'h']))).toBe(true) // a, free, h
  })

  it('does not false-positive on a scattered, non-aligned set', () => {
    // a (corner) + e (mid-right); no row/col/diagonal is completed by these alone.
    expect(hasBingo(card3, new Set(['a', 'e']))).toBe(false)
  })
})

describe('verifyClaim (host-side recompute)', () => {
  it('confirms a real bingo and rejects a bogus one', () => {
    const pid = 'p_zoe'
    const card = buildCard('ROOM', pid, POOL, 5)
    // Call exactly the top row of zoe's actual card -> a real line.
    const topRow = new Set(card.cells.slice(0, 5))
    expect(verifyClaim('ROOM', pid, POOL, 5, topRow)).toBe(true)
    // Nothing called -> no bingo (the free center alone is not a line on 5x5).
    expect(verifyClaim('ROOM', pid, POOL, 5, new Set())).toBe(false)
    // A different player's id recomputes a different card -> the same calls don't win.
    expect(verifyClaim('ROOM', 'p_other', POOL, 5, topRow)).toBe(false)
  })
})

describe('callOrder', () => {
  it('is a deterministic permutation of the distinct pool', () => {
    const a = callOrder('ROOM', POOL)
    const b = callOrder('ROOM', POOL)
    expect(b).toEqual(a)
    expect(new Set(a)).toEqual(new Set(POOL))
    expect(callOrder('XYZ9', POOL)).not.toEqual(a)
  })
})

describe('scoring', () => {
  it('places points by finishing order', () => {
    expect(placePoints(1)).toBe(100)
    expect(placePoints(2)).toBe(60)
    expect(placePoints(3)).toBe(40)
    expect(placePoints(7)).toBe(20)
  })

  it('builds a board: winners scored by place, everyone else at 0', () => {
    const roster = [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
      { id: 'p3', name: 'Cy' },
    ]
    const board = bingoLeaderboard(
      [
        { pid: 'p2', name: 'Bo', place: 1 },
        { pid: 'p3', name: 'Cy', place: 2 },
      ],
      roster,
    )
    expect(board[0]).toEqual({ id: 'p2', name: 'Bo', score: 100 })
    expect(board[1]).toEqual({ id: 'p3', name: 'Cy', score: 60 })
    expect(board[2]).toEqual({ id: 'p1', name: 'Ann', score: 0 })
  })
})

describe('packs', () => {
  it('every built-in pack has enough distinct items for a 5x5 card', () => {
    for (const pack of BINGO_PACKS) {
      const distinct = new Set(pack.items)
      expect(distinct.size, `${pack.key} has dupes`).toBe(pack.items.length)
      expect(distinct.size, `${pack.key} too small for 5x5`).toBeGreaterThanOrEqual(cellsNeeded(5))
    }
  })
})
