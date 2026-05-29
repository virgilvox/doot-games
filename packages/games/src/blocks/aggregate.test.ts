import type { ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { distributionToBars, gameAnswerKeys, scoreGame } from '../runtime/derive'
import { voteBox } from '../games/votebox'
import { guessBlock } from './guess/block'
import { pollBlock } from './poll/block'
import { rankBlock } from './rank/block'
import { type RateScale, formatScore, rateBlock, scaleMin } from './rate/block'

describe('guess block aggregate', () => {
  it('counts correct guesses only for eligible rounds', () => {
    const c0 = { ...guessBlock.defaultContent(), options: [{ label: 'a' }, { label: 'b' }], correct: 1 }
    const c2 = { ...c0, correct: 0 }
    const players: ScorePlayer[] = [
      { id: 'a', name: 'Ann', joinedAtIndex: 0 },
      { id: 'b', name: 'Bo', joinedAtIndex: 2 }, // joined at round 2
    ]
    const frag = guessBlock.aggregate?.({
      rounds: [
        { index: 0, content: c0 },
        { index: 2, content: c2 },
      ],
      inputsFor: (i) =>
        i === 0
          ? new Map([['a', { choice: 1 }], ['b', { choice: 1 }]])
          : new Map([['a', { choice: 0 }], ['b', { choice: 0 }]]),
      answerFor: (i) => (i === 0 ? { correct: 1 } : { correct: 0 }),
      players,
    })
    expect(frag?.leaderboard).toEqual([
      { id: 'a', name: 'Ann', score: 2, detail: '2 / 2' },
      { id: 'b', name: 'Bo', score: 1, detail: '1 / 1' }, // only eligible for round 2
    ])
  })
})

describe('rate block aggregate (flexible scale)', () => {
  it('averages by value and labels by tier', () => {
    const scale: RateScale = {
      kind: 'levels',
      levels: [
        { label: 'D', value: 1 },
        { label: 'C', value: 2 },
        { label: 'B', value: 3 },
        { label: 'A', value: 4 },
        { label: 'S', value: 5 },
      ],
    }
    const content = {
      ...rateBlock.defaultContent(),
      subject: 'Entry',
      categories: [{ id: 'o', label: 'Overall' }],
      scale,
    }
    const frag = rateBlock.aggregate?.({
      rounds: [{ index: 0, content }],
      inputsFor: () => new Map([['a', { ratings: { o: 4 } }], ['b', { ratings: { o: 4 } }]]),
      answerFor: () => undefined,
      players: [
        { id: 'a', name: 'A', joinedAtIndex: 0 },
        { id: 'b', name: 'B', joinedAtIndex: 0 },
      ],
    })
    expect(frag?.awards?.[0]).toEqual({ label: 'Top rated Overall', subject: 'Entry', value: 'A' })
  })
})

describe('rate scale helpers', () => {
  const tiers: RateScale = {
    kind: 'levels',
    levels: [
      { label: 'D', value: 1 },
      { label: 'C', value: 2 },
      { label: 'B', value: 3 },
      { label: 'A', value: 4 },
      { label: 'S', value: 5 },
    ],
  }

  it('rounds ties up to the higher tier, value-ordered', () => {
    expect(formatScore(2.5, tiers)).toBe('B') // tie C/B -> higher
    expect(formatScore(4.5, tiers)).toBe('S') // tie A/S -> higher
    expect(formatScore(2.2, tiers)).toBe('C')
    expect(scaleMin(tiers)).toBe(1)
  })

  it('requires every category before a rating can be submitted', () => {
    const content = {
      ...rateBlock.defaultContent(),
      categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    }
    expect(rateBlock.isComplete?.(content, { ratings: {} })).toBe(false)
    expect(rateBlock.isComplete?.(content, { ratings: { a: 3 } })).toBe(false)
    expect(rateBlock.isComplete?.(content, { ratings: { a: 3, b: 4 } })).toBe(true)
    expect(rateBlock.emptyInput(content)).toEqual({ ratings: {} })
  })
})

describe('poll block aggregate', () => {
  it('builds a distribution with no winner', () => {
    const content = { ...pollBlock.defaultContent(), options: [{ label: 'A' }, { label: 'B' }] }
    const frag = pollBlock.aggregate?.({
      rounds: [{ index: 0, content }],
      inputsFor: () => new Map([['a', { choice: 0 }], ['b', { choice: 0 }], ['c', { choice: 1 }]]),
      answerFor: () => undefined,
      players: [],
    })
    expect(frag?.leaderboard).toBeUndefined()
    expect(frag?.distributions?.[0]?.bars).toEqual([
      { label: 'A', count: 2 },
      { label: 'B', count: 1 },
    ])
  })
})

describe('rank block aggregate', () => {
  it('aggregates orders into a consensus ranking', () => {
    const content = {
      ...rankBlock.defaultContent(),
      prompt: 'Rank',
      items: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
    }
    const frag = rankBlock.aggregate?.({
      rounds: [{ index: 0, content }],
      inputsFor: () =>
        new Map([
          ['p1', { order: ['a', 'b', 'c'] }],
          ['p2', { order: ['a', 'c', 'b'] }], // a clearly first; b/c contested
        ]),
      answerFor: () => undefined,
      players: [],
    })
    const bars = frag?.distributions?.[0]?.bars
    expect(bars?.[0]).toMatchObject({ label: 'A', display: '#1' }) // unanimous first
    expect(frag?.leaderboard).toBeUndefined() // consensus, no winner
  })
})

describe('distributionToBars (results rendering)', () => {
  it('defaults to vote semantics when a block gives only counts', () => {
    const bars = distributionToBars({ title: 'Q', bars: [{ label: 'A', count: 2 }, { label: 'B', count: 1 }] })
    expect(bars[0]).toEqual({ label: 'A', value: 2, max: 3, display: undefined, note: '2 votes' })
    expect(bars[1]?.note).toBe('1 vote')
  })

  it('honors block-provided max/display/note (e.g. a ranking chart)', () => {
    const bars = distributionToBars({
      title: 'R',
      bars: [{ label: 'A', count: 3, max: 3, display: '#1', note: 'avg 0.5' }],
    })
    expect(bars[0]).toEqual({ label: 'A', value: 3, max: 3, display: '#1', note: 'avg 0.5' })
  })
})

describe('scoreGame merges block fragments', () => {
  it('produces a leaderboard (guess) and awards (rate) for the VoteBox composition', () => {
    const cfg = voteBox.defaultConfig
    const players: ScorePlayer[] = [{ id: 'a', name: 'Ann', joinedAtIndex: 0 }]
    const result = scoreGame(voteBox, cfg, {
      inputsFor: () => new Map(),
      players,
      answerKeys: gameAnswerKeys(voteBox, cfg),
    })
    expect(result.leaderboard?.length).toBe(1) // guess block contributed
    expect(result.headline).toBe('Ann wins')
    expect(result.stats?.[0]).toEqual({ label: 'Players', value: 1 })
  })
})
