import type { BlockResultsContext, DeriveContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  type VoteAnswer,
  type VoteContent,
  type VoteInput,
  type VoteRevealSummary,
  voteBlock,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]

// Identity shuffle so option order is deterministic in the test.
const identityShuffle = <T>(items: T[]): T[] => items

// A render that reads a `.text` field, mirroring buildDeriveContent's default.
const textRender = (input: unknown) => (input as { text?: string } | undefined)?.text ?? ''

function derive() {
  const sources: DeriveContext<VoteContent>['sources'] = [
    {
      index: 0,
      content: { prompt: 'Best snack?' },
      inputs: new Map<string, unknown>([
        ['A', { text: 'apple' }],
        ['B', { text: 'banana' }],
        ['C', { text: 'cherry' }],
      ]),
      render: textRender,
    },
  ]
  return voteBlock.derive!({
    content: { prompt: 'Which wins?', options: [], mode: 'field', timer: 30 },
    sources,
    players,
    shuffle: identityShuffle,
  })
}

describe('vote block derive', () => {
  it('builds anonymized, shuffled options and a withheld author map', () => {
    const { publish, answer } = derive()
    expect(publish.prompt).toBe('Best answer: "Best snack?"')
    expect(publish.options).toEqual([
      { id: 'o0', text: 'apple' },
      { id: 'o1', text: 'banana' },
      { id: 'o2', text: 'cherry' },
    ])
    // The published options carry NO author info; the map is the withheld key.
    expect(JSON.stringify(publish.options)).not.toContain('A')
    expect((answer as VoteAnswer).authors).toEqual({ o0: 'A', o1: 'B', o2: 'C' })
  })
})

describe('vote block aggregate', () => {
  it('scores authors by vote share with a pity floor', () => {
    const { publish, answer } = derive()
    // A's apple gets 2 votes, B's banana 1, C's cherry 0.
    const votes = new Map<string, VoteInput>([
      ['A', { choice: 'o1' }],
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o0' }],
    ])
    const ctx: BlockResultsContext<VoteContent, VoteInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const frag = voteBlock.aggregate!(ctx)
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Ada).toBe(667) // 2/3 of 1000
    expect(board.Bea).toBe(333) // 1/3
    expect(board.Cy).toBe(100) // no votes -> pity floor
  })
})

describe('vote block revealSummary', () => {
  it('ranks answers and names the winner with its author', () => {
    const { publish, answer } = derive()
    const votes = new Map<string, VoteInput>([
      ['A', { choice: 'o1' }],
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o0' }],
    ])
    const ctx: RevealContext<VoteContent, VoteInput> = {
      content: publish,
      inputs: votes,
      answer,
      players,
    }
    const summary = voteBlock.revealSummary!(ctx) as VoteRevealSummary
    expect(summary.winnerId).toBe('o0')
    expect(summary.tallies[0]).toMatchObject({ text: 'apple', votes: 2, author: 'Ada' })
  })
})

describe('vote block self-vote exclusion', () => {
  it('does not count a vote for your own answer (even if the client submits one)', () => {
    const { publish, answer } = derive() // o0=A(apple), o1=B(banana), o2=C(cherry)
    // A votes for its OWN answer (o0); C votes its OWN (o2); only B's cross-vote counts.
    const votes = new Map<string, VoteInput>([
      ['A', { choice: 'o0' }],
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o2' }],
    ])
    const summary = voteBlock.revealSummary!({ content: publish, inputs: votes, answer, players }) as VoteRevealSummary
    const byId = Object.fromEntries(summary.tallies.map((t) => [t.id, t.votes]))
    expect(byId.o0).toBe(1) // B's cross-vote only; A's self-vote ignored
    expect(byId.o2).toBe(0) // C's self-vote ignored
  })
})

describe('vote block final-round doubling', () => {
  it('doubles the last vote round (roundMultiplier within the block group)', () => {
    const { publish, answer } = derive()
    const votes = new Map<string, VoteInput>([
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o0' }],
    ]) // A's answer sweeps both rounds; A casts no vote
    const ctx: BlockResultsContext<VoteContent, VoteInput> = {
      rounds: [
        { index: 1, content: publish },
        { index: 3, content: publish },
      ],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries((voteBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.name, e.score]))
    // round 1: 1000 share + 500 sweep = 1500; final round x2 = 3000; total 4500.
    expect(board.Ada).toBe(4500)
    expect(board.Bea).toBe(200) // pity 100 x 2 rounds
  })
})

describe('vote block keeps a departed author scored', () => {
  it('scores and names an author who submitted then left before the results', () => {
    const { publish, answer } = derive() // o0=A,o1=B,o2=C; names captured at derive
    // C's answer wins, but C has left: only Ada and Bea are in the live roster.
    const votes = new Map<string, VoteInput>([
      ['A', { choice: 'o2' }],
      ['B', { choice: 'o2' }],
    ])
    const ctx: BlockResultsContext<VoteContent, VoteInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players: [players[0]!, players[1]!], // C is gone
    }
    const board = voteBlock.aggregate!(ctx).leaderboard ?? []
    const cy = board.find((e) => e.id === 'C')
    expect(cy).toBeTruthy()
    expect(cy?.name).toBe('Cy') // captured name, not dropped or "Someone"
    expect(cy?.score).toBeGreaterThan(0)
    expect(board[0]?.id).toBe('C') // and the departed author still wins
  })
})

describe('vote block derive edge cases', () => {
  const baseCtx = (inputs: Map<string, unknown>): DeriveContext<VoteContent> => ({
    content: { prompt: 'Which wins?', options: [], mode: 'field', timer: 30 },
    sources: [{ index: 0, content: { prompt: 'Q' }, inputs, render: textRender }],
    players,
    shuffle: identityShuffle,
  })

  it('produces no options when nobody submitted', () => {
    const { publish } = voteBlock.derive!(baseCtx(new Map()))
    expect(publish.options).toEqual([])
  })

  it('drops blank/whitespace submissions', () => {
    const inputs = new Map([
      ['A', { text: '  ' }],
      ['B', { text: 'real' }],
    ])
    const { publish } = voteBlock.derive!(baseCtx(inputs))
    expect(publish.options).toEqual([{ id: 'o0', text: 'real' }])
  })

  it('keeps duplicate-text answers as distinct options with distinct authors', () => {
    const inputs = new Map([
      ['A', { text: 'pizza' }],
      ['B', { text: 'pizza' }],
    ])
    const { publish, answer } = voteBlock.derive!(baseCtx(inputs))
    expect(publish.options).toEqual([
      { id: 'o0', text: 'pizza' },
      { id: 'o1', text: 'pizza' },
    ])
    expect((answer as VoteAnswer).authors).toEqual({ o0: 'A', o1: 'B' })
  })
})
