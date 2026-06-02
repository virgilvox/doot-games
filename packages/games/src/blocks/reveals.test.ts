import type { RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type PollContent, type PollInput, type PollRevealSummary, pollBlock } from './poll/block'
import { type RankContent, type RankInput, type RankRevealSummary, rankBlock } from './rank/block'
import { type RateContent, type RateInput, type RateRevealSummary, rateBlock } from './rate/block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]

describe('poll revealSummary (you vs the room)', () => {
  it('counts votes and names the room top pick', () => {
    const content: PollContent = {
      prompt: 'Pizza?',
      image: '',
      timer: null,
      options: [{ label: 'Yes' }, { label: 'No' }, { label: 'Maybe' }],
    }
    const inputs = new Map<string, PollInput>([
      ['A', { choice: 0 }],
      ['B', { choice: 0 }],
      ['C', { choice: 2 }],
    ])
    const ctx: RevealContext<PollContent, PollInput> = { content, inputs, answer: undefined, players }
    const s = pollBlock.revealSummary!(ctx) as PollRevealSummary
    expect(s.counts).toEqual([2, 0, 1])
    expect(s.topIndex).toBe(0)
    expect(s.topLabel).toBe('Yes')
    expect(s.total).toBe(3)
  })

  it('reports no top pick when nobody voted', () => {
    const content: PollContent = { prompt: 'Q', image: '', timer: null, options: [{ label: 'A' }, { label: 'B' }] }
    const s = pollBlock.revealSummary!({ content, inputs: new Map(), answer: undefined, players }) as PollRevealSummary
    expect(s.topIndex).toBe(-1)
    expect(s.topLabel).toBe('')
    expect(s.total).toBe(0)
  })
})

describe('rate revealSummary (per-category room average)', () => {
  it('averages each category over the players who rated it', () => {
    const content: RateContent = {
      subject: '',
      prompt: 'Rate it',
      image: '',
      timer: null,
      categories: [
        { id: 'taste', label: 'Taste' },
        { id: 'looks', label: 'Looks' },
      ],
      scale: { kind: 'numeric', min: 1, max: 10, step: 1 },
    }
    const inputs = new Map<string, RateInput>([
      ['A', { ratings: { taste: 8, looks: 6 } }],
      ['B', { ratings: { taste: 4, looks: 6 } }],
      ['C', { ratings: { taste: 6 } }], // didn't rate looks
    ])
    const ctx: RevealContext<RateContent, RateInput> = { content, inputs, answer: undefined, players }
    const s = rateBlock.revealSummary!(ctx) as RateRevealSummary
    const taste = s.categories.find((c) => c.id === 'taste')!
    const looks = s.categories.find((c) => c.id === 'looks')!
    expect(taste).toMatchObject({ avg: 6, count: 3 }) // (8+4+6)/3
    expect(looks).toMatchObject({ avg: 6, count: 2 }) // (6+6)/2
  })
})

describe('rank revealSummary (consensus order)', () => {
  it('orders items by average position across players', () => {
    const content: RankContent = {
      prompt: 'Rank',
      image: '',
      timer: null,
      items: [
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
        { id: 'z', label: 'Z' },
      ],
    }
    // Everyone ranks x first, then y, then z.
    const inputs = new Map<string, RankInput>([
      ['A', { order: ['x', 'y', 'z'] }],
      ['B', { order: ['x', 'y', 'z'] }],
      ['C', { order: ['x', 'z', 'y'] }],
    ])
    const ctx: RevealContext<RankContent, RankInput> = { content, inputs, answer: undefined, players }
    const s = rankBlock.revealSummary!(ctx) as RankRevealSummary
    expect(s.order.map((o) => o.id)).toEqual(['x', 'y', 'z'])
    expect(s.order[0]).toEqual({ id: 'x', label: 'X' })
  })
})
