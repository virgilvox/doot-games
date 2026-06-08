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

describe('split block audience bloc (P4B: capped crowd, never on the board)', () => {
  function ctx(crowd?: Map<string, SplitInput>): BlockResultsContext<SplitContent, SplitInput> {
    const { publish, answer } = derive() // s0 = Ada's scenario, s1 = Bea's
    // Everyone votes YES on s0 -> 3-0, very one-sided, so Ada (who wants to DIVIDE) scores low.
    const votes = new Map<string, SplitInput>([
      ['B', { votes: { s0: 'yes', s1: 'yes' } }],
      ['C', { votes: { s0: 'yes', s1: 'no' } }],
      ['D', { votes: { s0: 'yes', s1: 'no' } }],
    ])
    return {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
      audienceVotesFor: crowd ? () => crowd : undefined,
    }
  }
  const scoreOf = (c: BlockResultsContext<SplitContent, SplitInput>, name: string) =>
    (splitBlock.aggregate!(c).leaderboard ?? []).find((e) => e.name === name)?.score ?? 0

  it("a crowd's NO votes even out a one-sided scenario (lifting its author), capped + off the board", () => {
    const base = scoreOf(ctx(), 'Ada') // s0 is 3-0 -> one-sided -> low split score
    const crowd = new Map<string, SplitInput>(
      Array.from({ length: 100 }, (_, i) => [`aud${i}`, { votes: { s0: 'no' } }]),
    )
    const withCrowd = ctx(crowd)
    // playerTotal on s0 is 3 -> cap 2, so the 100 crowd NOs add only 2: s0 becomes 3-2,
    // closer to 50/50, so Ada (rewarded for dividing) scores MORE, but the crowd couldn't run it up.
    expect(scoreOf(withCrowd, 'Ada')).toBeGreaterThan(base)
    const board = splitBlock.aggregate!(withCrowd).leaderboard ?? []
    expect(board.some((e) => e.id?.startsWith('aud'))).toBe(false) // spectators never on the board
    expect(board.map((e) => e.id).sort()).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('split block timeout safety net', () => {
  // Only A submits; B/C/D are eligible non-submitters and get the canned dilemma.
  function deriveWithPool() {
    return splitBlock.derive!({
      content: { prompt: 'Vote yes/no', scenarios: [], timer: 40 },
      sources: [
        {
          index: 0,
          content: { prompt: 'Would you?', safetyAnswers: ['Would you give up coffee forever?'] },
          inputs: new Map<string, unknown>([['A', { text: 'Would you eat a bug?' }]]),
          render: textRender,
        },
      ],
      players,
      shuffle: identityShuffle,
    })
  }

  it('fills eligible non-submitters with a safety dilemma, flagged in the key', () => {
    const { publish, answer } = deriveWithPool()
    const ans = answer as SplitAnswer
    expect(publish.scenarios.length).toBe(4) // A's real one + B/C/D safety
    expect(ans.safety?.length).toBe(3)
    const aId = Object.keys(ans.authors).find((id) => ans.authors[id] === 'A')!
    expect(ans.safety).not.toContain(aId) // A actually submitted
    for (const sid of ans.safety!) expect(publish.scenarios.find((s) => s.id === sid)!.text).toBe('Would you give up coffee forever?')
  })

  it('scores a safety dilemma at half', () => {
    const { publish, answer } = deriveWithPool()
    const ans = answer as SplitAnswer
    const sid = ans.safety![0]!
    // A perfect 2/2 split would be full 1000; the safety dilemma earns half.
    const votes = new Map<string, SplitInput>([
      ['w', { votes: { [sid]: 'yes' } }],
      ['x', { votes: { [sid]: 'yes' } }],
      ['y', { votes: { [sid]: 'no' } }],
      ['z', { votes: { [sid]: 'no' } }],
    ])
    const ctx: BlockResultsContext<SplitContent, SplitInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries((splitBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.id, e.score]))
    expect(board[ans.authors[sid]!]).toBe(500)
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
