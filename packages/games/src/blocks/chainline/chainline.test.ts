import type { DeriveSource, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { storyChain } from '../../games/story-chain'
import {
  type ChainlineContent,
  type ChainlineInput,
  type ChainlineRecap,
  type ChainlineSecret,
  chainlineBlock,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bo', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const content: ChainlineContent = { prompt: 'go', step: 2, total: 4, seed: false, timer: 60 }
const noShuffle = <T,>(x: T[]) => x

function source(index: number, inputs: Map<string, unknown>): DeriveSource {
  return { index, content: {}, inputs, render: (i) => String((i as { text?: string })?.text ?? '') }
}
const m = (entries: Record<string, string>): Map<string, unknown> =>
  new Map(Object.entries(entries).map(([pid, text]) => [pid, { text }]))

describe('chainline assignContent (the rotation)', () => {
  it('hands each player their LEFT neighbor prior line (ring = sorted round-0 submitters)', () => {
    // Round 1: from=[0], one source (round 0) is both the ring and the content.
    const round0 = m({ A: 'cat', B: 'dog', C: 'fish' })
    const out = chainlineBlock.assignContent?.({ content, players, shuffle: noShuffle, sources: [source(0, round0)] })
    const pp = out?.perPlayer as Record<string, ChainlineSecret>
    // sorted ring [A,B,C]; left neighbor (one seat back, wrapping): A<-C, B<-A, C<-B
    expect(pp.A?.received).toBe('fish')
    expect(pp.B?.received).toBe('cat')
    expect(pp.C?.received).toBe('dog')
    expect(pp.A?.seed).toBe(false)
  })

  it('uses round 0 for the ring but the immediate-previous round for the line (round >= 2)', () => {
    // Round 2: from=[1,0]. Ring comes from index-0 source; the line from index-1.
    const round0 = m({ A: 'cat', B: 'dog', C: 'fish' })
    const round1 = m({ A: 'a1', B: 'b1', C: 'c1' })
    const out = chainlineBlock.assignContent?.({
      content,
      players,
      shuffle: noShuffle,
      sources: [source(1, round1), source(0, round0)],
    })
    const pp = out?.perPlayer as Record<string, ChainlineSecret>
    expect(pp.A?.received).toBe('c1') // A <- C, reading round 1
    expect(pp.B?.received).toBe('a1')
    expect(pp.C?.received).toBe('b1')
  })

  it('the seed round (no sources) hands out nothing', () => {
    const out = chainlineBlock.assignContent?.({ content, players, shuffle: noShuffle, sources: [] })
    expect(out?.perPlayer).toEqual({})
  })

  it('a missing neighbor line yields an empty received (graceful, not a crash)', () => {
    const round0 = m({ A: 'cat', B: 'dog', C: 'fish' })
    const round1 = m({ A: 'a1', C: 'c1' }) // B skipped round 1
    const out = chainlineBlock.assignContent?.({
      content,
      players,
      shuffle: noShuffle,
      sources: [source(1, round1), source(0, round0)],
    })
    const pp = out?.perPlayer as Record<string, ChainlineSecret>
    expect(pp.C?.received).toBe('') // C <- B, who skipped
  })
})

describe('chainline aggregate (the unspool)', () => {
  it('reconstructs each thread origin -> next as the line travels the ring', () => {
    const round0 = m({ A: 'cat', B: 'dog', C: 'fish' })
    const round1 = m({ A: 'a1', B: 'b1', C: 'c1' })
    const frag = chainlineBlock.aggregate?.({
      rounds: [
        { index: 0, content: { ...content, seed: true, step: 1 } },
        { index: 1, content },
      ],
      inputsFor: (i) => (i === 0 ? round0 : round1) as Map<string, ChainlineInput>,
      answerFor: () => undefined,
      players,
    })
    const recap = frag?.recap as ChainlineRecap
    expect(recap.threads).toHaveLength(3)
    // Thread 0 starts with Ada (ring pos 0): round0 'cat', round1 held by Bo (pos 1) = 'b1'.
    expect(recap.threads[0]?.map((s) => s.text)).toEqual(['cat', 'b1'])
    expect(recap.threads[0]?.map((s) => s.name)).toEqual(['Ada', 'Bo'])
    // Thread 1 (Bo origin): dog -> c1 (Cy); Thread 2 (Cy): fish -> a1 (Ada).
    expect(recap.threads[1]?.map((s) => s.text)).toEqual(['dog', 'c1'])
    expect(recap.threads[2]?.map((s) => s.text)).toEqual(['fish', 'a1'])
    expect(frag?.headline).toBe('3 stories told')
  })
})

describe('story-chain buildConfig', () => {
  it('builds N chain rounds: round 0 seeds (no from), later rounds read prev + round 0', () => {
    const cfg = storyChain.buildConfig?.('room1', { rounds: 4})
    expect(cfg?.rounds).toHaveLength(4)
    const r = cfg?.rounds ?? []
    expect((r[0]?.content as ChainlineContent).seed).toBe(true)
    expect(r[0]?.from).toBeUndefined()
    expect(r[1]?.from).toEqual([0]) // round 1 reads round 0 (ring + line in one)
    expect(r[2]?.from).toEqual([1, 0]) // round 2: prev=1, ring=0
    expect(r[3]?.from).toEqual([2, 0])
    expect((r[3]?.content as ChainlineContent).total).toBe(4)
    expect((r[3]?.content as ChainlineContent).step).toBe(4)
  })

  it('clamps the round count to the supported range', () => {
    expect(storyChain.buildConfig?.('s', { rounds: 99 })?.rounds.length).toBe(10)
    expect(storyChain.buildConfig?.('s', { rounds: 1 })?.rounds.length).toBe(3)
  })

  it('is deterministic for a room (same seed -> same opening prompt)', () => {
    const a = storyChain.buildConfig?.('ROOM', { rounds: 3 })
    const b = storyChain.buildConfig?.('ROOM', { rounds: 3 })
    expect((a?.rounds[0]?.content as ChainlineContent).prompt).toBe((b?.rounds[0]?.content as ChainlineContent).prompt)
  })
})
