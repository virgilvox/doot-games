import { describe, expect, it } from 'vitest'
import { chainOrder, chainSourceFor, chainThreads } from './chain'
import { seededShuffle } from './derive'

describe('chainOrder', () => {
  it('is stable for the same SET regardless of input order (canonical sort first)', () => {
    const shuffle = seededShuffle('room:chain')
    const a = chainOrder(['c', 'a', 'b', 'd'], shuffle)
    const b = chainOrder(['d', 'b', 'a', 'c'], shuffle)
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual(['a', 'b', 'c', 'd']) // a permutation of the set
  })

  it('dedupes repeated ids', () => {
    const shuffle = seededShuffle('seed')
    expect(chainOrder(['a', 'a', 'b'], shuffle).sort()).toEqual(['a', 'b'])
  })

  it('different seeds can give different rings, same seed is reproducible', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(chainOrder(ids, seededShuffle('r1'))).toEqual(chainOrder(ids, seededShuffle('r1')))
  })
})

describe('chainSourceFor', () => {
  const order = ['a', 'b', 'c', 'd'] // positions 0..3

  it('round 0 (seed) gives the player their own thread', () => {
    for (const pid of order) expect(chainSourceFor(order, 0, pid)).toBe(pid)
  })

  it('round >= 1 gives the LEFT neighbor (one seat back, wrapping)', () => {
    expect(chainSourceFor(order, 1, 'a')).toBe('d') // wraps
    expect(chainSourceFor(order, 1, 'b')).toBe('a')
    expect(chainSourceFor(order, 1, 'c')).toBe('b')
    expect(chainSourceFor(order, 1, 'd')).toBe('c')
    // The source is the immediately prior round's left neighbor every round, so a
    // later round resolves to the same neighbor (the THREAD differs, not the seat).
    expect(chainSourceFor(order, 3, 'b')).toBe('a')
  })

  it('handles a 2-player ring (your neighbor is the other player)', () => {
    const two = ['x', 'y']
    expect(chainSourceFor(two, 1, 'x')).toBe('y')
    expect(chainSourceFor(two, 1, 'y')).toBe('x')
  })

  it('returns undefined for an unknown pid or an empty ring', () => {
    expect(chainSourceFor(order, 1, 'z')).toBeUndefined()
    expect(chainSourceFor([], 1, 'a')).toBeUndefined()
  })
})

describe('chainThreads (unspool)', () => {
  const order = ['a', 'b', 'c']

  it('reconstructs each thread as the paper travels the ring one seat per round', () => {
    // Round r input: pid -> a marker so we can trace who touched the thread.
    const inputsByRound = [
      new Map<string, unknown>([
        ['a', 'a0'],
        ['b', 'b0'],
        ['c', 'c0'],
      ]),
      new Map<string, unknown>([
        ['a', 'a1'],
        ['b', 'b1'],
        ['c', 'c1'],
      ]),
      new Map<string, unknown>([
        ['a', 'a2'],
        ['b', 'b2'],
        ['c', 'c2'],
      ]),
    ]
    const threads = chainThreads(order, inputsByRound)
    expect(threads).toHaveLength(3)
    // Thread 0 starts with a (pos 0): round0 a, round1 b (pos1), round2 c (pos2).
    expect(threads[0]?.map((s) => s.input)).toEqual(['a0', 'b1', 'c2'])
    expect(threads[0]?.map((s) => s.pid)).toEqual(['a', 'b', 'c'])
    // Thread 1 starts with b: b -> c -> a (wraps).
    expect(threads[1]?.map((s) => s.input)).toEqual(['b0', 'c1', 'a2'])
    // Thread 2 starts with c: c -> a -> b.
    expect(threads[2]?.map((s) => s.input)).toEqual(['c0', 'a1', 'b2'])
  })

  it('marks a missing submission as undefined (a player who skipped a round)', () => {
    const inputsByRound = [
      new Map<string, unknown>([['a', 'a0']]), // b, c never submitted round 0
      new Map<string, unknown>([['b', 'b1']]),
    ]
    const threads = chainThreads(order, inputsByRound)
    expect(threads[0]?.[0]?.input).toBe('a0')
    expect(threads[0]?.[1]?.input).toBe('b1') // pos1 = b submitted round 1
    expect(threads[1]?.[0]?.input).toBeUndefined() // thread1 round0 held by b, who skipped
  })
})

describe('chain end to end (rotation + unspool agree)', () => {
  it('the source each round is exactly the previous holder in the unspooled thread', () => {
    const order = chainOrder(['p1', 'p2', 'p3', 'p4'], seededShuffle('ROOM'))
    const rounds = 4
    // For every thread and every round >= 1, the player one step earlier in the
    // thread must be that round's chainSourceFor for the current holder.
    const threads = chainThreads(
      order,
      Array.from({ length: rounds }, () => new Map<string, unknown>()),
    )
    for (const thread of threads) {
      for (let r = 1; r < rounds; r++) {
        const holder = thread[r]?.pid as string
        const prevHolder = thread[r - 1]?.pid as string
        expect(chainSourceFor(order, r, holder)).toBe(prevHolder)
      }
    }
  })
})
