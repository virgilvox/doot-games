import type { BlockResultsContext, DeriveContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import type { DrawValue } from '@doot-games/ui'
import { describe, expect, it } from 'vitest'
import {
  type DrawVoteAnswer,
  type DrawVoteContent,
  type DrawVoteInput,
  type DrawVoteRevealSummary,
  drawVoteBlock,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const identityShuffle = <T>(items: T[]): T[] => items
const draw = (n: number): DrawValue => ({ strokes: [{ color: '#000', size: 4, points: [0, 0, n, n] }] })
// drawvote reads source.inputs directly (a drawing can't render to text).
const noRender = () => ''

function derive(inputs: Map<string, unknown>) {
  const sources: DeriveContext<DrawVoteContent>['sources'] = [
    { index: 0, content: { prompt: 'A dog driving a car', aspect: 0.7 }, inputs, render: noRender },
  ]
  return drawVoteBlock.derive!({
    content: { prompt: 'Which drawing wins?', options: [], aspect: 0.7, timer: 30, hideUntilReveal: true },
    sources,
    players,
    shuffle: identityShuffle,
  })
}

describe('drawvote derive', () => {
  it('carries the drawings (strokes) into anonymized options and withholds the author map', () => {
    const { publish, answer } = derive(
      new Map<string, unknown>([
        ['A', draw(1)],
        ['B', draw(2)],
      ]),
    )
    expect(publish.options).toEqual([
      { id: 'o0', drawing: draw(1) },
      { id: 'o1', drawing: draw(2) },
    ])
    expect(publish.prompt).toBe('Best drawing: "A dog driving a car"')
    expect(publish.aspect).toBe(0.7)
    expect((answer as DrawVoteAnswer).authors).toEqual({ o0: 'A', o1: 'B' })
    // The published options carry NO author info.
    expect(JSON.stringify(publish.options)).not.toContain('"A"')
  })

  it('drops empty drawings (no strokes)', () => {
    const { publish } = derive(
      new Map<string, unknown>([
        ['A', { strokes: [] }],
        ['B', draw(5)],
      ]),
    )
    expect(publish.options).toEqual([{ id: 'o0', drawing: draw(5) }])
  })
})

describe('drawvote aggregate', () => {
  it('scores artists by vote share with a pity floor, ignoring self-votes', () => {
    const { publish, answer } = derive(
      new Map<string, unknown>([
        ['A', draw(1)],
        ['B', draw(2)],
        ['C', draw(3)],
      ]),
    )
    // o0=A, o1=B, o2=C. B and C vote A; A votes its OWN (ignored).
    const votes = new Map<string, DrawVoteInput>([
      ['A', { choice: 'o0' }],
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o0' }],
    ])
    const ctx: BlockResultsContext<DrawVoteContent, DrawVoteInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries(
      (drawVoteBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.name, e.score]),
    )
    expect(board.Ada).toBe(1500) // 2 of 2 counted votes => full share 1000 + sweep 500
    expect(board.Bea).toBe(100) // pity
    expect(board.Cy).toBe(100) // pity
  })
})

describe('drawvote revealSummary', () => {
  it('ranks drawings and names the winning artist', () => {
    const { publish, answer } = derive(
      new Map<string, unknown>([
        ['A', draw(1)],
        ['B', draw(2)],
      ]),
    )
    const votes = new Map<string, DrawVoteInput>([['B', { choice: 'o0' }]]) // B votes A's drawing
    const ctx: RevealContext<DrawVoteContent, DrawVoteInput> = { content: publish, inputs: votes, answer, players }
    const summary = drawVoteBlock.revealSummary!(ctx) as DrawVoteRevealSummary
    expect(summary.winnerId).toBe('o0')
    expect(summary.tallies[0]).toMatchObject({ votes: 1, author: 'Ada' })
    expect(summary.tallies[0]?.drawing).toEqual(draw(1))
  })
})
