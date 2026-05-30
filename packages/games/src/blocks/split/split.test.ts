import type { BlockResultsContext, DeriveContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type SplitAnswer, type SplitContent, type SplitInput, splitBlock } from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
  { id: 'D', name: 'Di', joinedAtIndex: 0 },
]
const identityShuffle = <T>(items: T[]): T[] => items
const textRender = (input: unknown) => (input as { text?: string } | undefined)?.text ?? ''

function derive() {
  const sources: DeriveContext<SplitContent>['sources'] = [
    {
      index: 0,
      content: { prompt: 'Would you?' },
      inputs: new Map<string, unknown>([
        ['A', { text: 'Would you eat a bug?' }],
        ['B', { text: 'Would you skydive?' }],
      ]),
      render: textRender,
    },
  ]
  return splitBlock.derive!({
    content: { prompt: 'Vote yes/no', scenarios: [], timer: 40 },
    sources,
    players,
    shuffle: identityShuffle,
  })
}

describe('split block derive', () => {
  it('builds anonymized scenarios + a withheld author map', () => {
    const { publish, answer } = derive()
    expect(publish.scenarios).toEqual([
      { id: 's0', text: 'Would you eat a bug?' },
      { id: 's1', text: 'Would you skydive?' },
    ])
    expect((answer as SplitAnswer).authors).toEqual({ s0: 'A', s1: 'B' })
    expect(JSON.stringify(publish.scenarios)).not.toContain('A')
  })
})

describe('split block scoring (closeness to 50/50)', () => {
  it('rewards an even split and excludes the author\'s own vote', () => {
    const { publish, answer } = derive() // s0 by A, s1 by B
    // On A's scenario (s0): B/C/D vote yes/yes/no -> 2 yes, 1 no (A's own vote ignored).
    // On B's scenario (s1): A/C/D vote yes/no/no -> 1 yes, 2 no.
    const votes = new Map<string, SplitInput>([
      ['A', { votes: { s0: 'no', s1: 'yes' } }], // A's s0 vote is excluded (own)
      ['B', { votes: { s0: 'yes', s1: 'no' } }], // B's s1 vote is excluded (own)
      ['C', { votes: { s0: 'yes', s1: 'no' } }],
      ['D', { votes: { s0: 'no', s1: 'no' } }],
    ])
    const ctx: BlockResultsContext<SplitContent, SplitInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries((splitBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.name, e.score]))
    // s0: B,C yes + D no = 2 yes / 1 no -> closeness(2,3)= 1 - |0.667-0.5|*2 = 0.667 -> 667
    expect(board.Ada).toBe(667)
    // s1: C,D no + A yes... wait A voted s1 yes (not own) -> A,? : voters !== B: A yes, C no, D no = 1 yes / 2 no -> 667
    expect(board.Bea).toBe(667)
    // C and D authored nothing -> 0
    expect(board.Cy).toBe(0)
  })

  it('gives near-zero for a one-sided (non-divisive) scenario', () => {
    const { publish, answer } = derive()
    const votes = new Map<string, SplitInput>([
      ['B', { votes: { s0: 'yes', s1: 'no' } }],
      ['C', { votes: { s0: 'yes', s1: 'no' } }],
      ['D', { votes: { s0: 'yes', s1: 'no' } }],
    ])
    const ctx: BlockResultsContext<SplitContent, SplitInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries((splitBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Ada).toBe(0) // s0 unanimous yes -> 0 closeness
  })
})

describe('split block isComplete', () => {
  it('requires a vote on every scenario', () => {
    const content: SplitContent = { prompt: 'p', scenarios: [{ id: 's0', text: 'a' }, { id: 's1', text: 'b' }], timer: 40 }
    expect(splitBlock.isComplete!(content, { votes: { s0: 'yes' } })).toBe(false)
    expect(splitBlock.isComplete!(content, { votes: { s0: 'yes', s1: 'no' } })).toBe(true)
  })
})
