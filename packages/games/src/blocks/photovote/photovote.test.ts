import type { BlockResultsContext, DeriveContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  type PhotoVoteAnswer,
  type PhotoVoteContent,
  type PhotoVoteInput,
  type PhotoVoteRevealSummary,
  photoVoteBlock,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const identityShuffle = <T>(items: T[]): T[] => items
const pic = (n: number) => `data:image/jpeg;base64,pic${n}`
const noRender = () => ''

function derive(inputs: Map<string, unknown>) {
  const sources: DeriveContext<PhotoVoteContent>['sources'] = [
    { index: 0, content: { prompt: 'Your best pet pic' }, inputs, render: noRender },
  ]
  return photoVoteBlock.derive!({
    content: { prompt: 'Which photo wins?', options: [], timer: 30, hideUntilReveal: true },
    sources,
    players,
    shuffle: identityShuffle,
  })
}

describe('photovote derive', () => {
  it('carries the shared photos into anonymized options and withholds the author map', () => {
    const { publish, answer } = derive(
      new Map<string, unknown>([
        ['A', { media: pic(1) }],
        ['B', { media: pic(2) }],
      ]),
    )
    expect(publish.options).toEqual([
      { id: 'o0', media: pic(1) },
      { id: 'o1', media: pic(2) },
    ])
    expect(publish.prompt).toBe('Best photo: "Your best pet pic"')
    expect((answer as PhotoVoteAnswer).authors).toEqual({ o0: 'A', o1: 'B' })
    expect(JSON.stringify(publish.options)).not.toContain('"A"') // no author info in options
  })

  it('drops empty shares (no media)', () => {
    const { publish } = derive(
      new Map<string, unknown>([
        ['A', { text: 'oops typed instead' }],
        ['B', { media: pic(5) }],
      ]),
    )
    expect(publish.options).toEqual([{ id: 'o0', media: pic(5) }])
  })
})

describe('photovote aggregate', () => {
  it('scores sharers by vote share with a pity floor, ignoring self-votes', () => {
    const { publish, answer } = derive(
      new Map<string, unknown>([
        ['A', { media: pic(1) }],
        ['B', { media: pic(2) }],
        ['C', { media: pic(3) }],
      ]),
    )
    // o0=A, o1=B, o2=C. B and C vote A; A self-votes (ignored).
    const votes = new Map<string, PhotoVoteInput>([
      ['A', { choice: 'o0' }],
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o0' }],
    ])
    const ctx: BlockResultsContext<PhotoVoteContent, PhotoVoteInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries((photoVoteBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Ada).toBe(1500) // 2 of 2 counted votes => full share 1000 + sweep 500
    expect(board.Bea).toBe(100) // pity
    expect(board.Cy).toBe(100) // pity
  })
})

describe('photovote revealSummary', () => {
  it('ranks photos and names the winning sharer', () => {
    const { publish, answer } = derive(
      new Map<string, unknown>([
        ['A', { media: pic(1) }],
        ['B', { media: pic(2) }],
      ]),
    )
    const votes = new Map<string, PhotoVoteInput>([['B', { choice: 'o0' }]]) // B votes A's photo
    const ctx: RevealContext<PhotoVoteContent, PhotoVoteInput> = { content: publish, inputs: votes, answer, players }
    const summary = photoVoteBlock.revealSummary!(ctx) as PhotoVoteRevealSummary
    expect(summary.winnerId).toBe('o0')
    expect(summary.tallies[0]).toMatchObject({ votes: 1, author: 'Ada', media: pic(1) })
  })
})
