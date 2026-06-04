import type { BlockResultsContext, DeriveContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  type FibAnswer,
  type FibContent,
  type FibInput,
  type FibRevealSummary,
  fibBlock,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]

const identityShuffle = <T>(items: T[]): T[] => items
const textRender = (input: unknown) => (input as { text?: string } | undefined)?.text ?? ''

function deriveWith(inputs: Map<string, unknown>, truth = 'parliament') {
  const sources: DeriveContext<FibContent>['sources'] = [
    { index: 0, content: { prompt: 'A group of owls is called a ___.' }, inputs, render: textRender },
  ]
  return fibBlock.derive!({
    content: { prompt: 'Which is TRUE?', truth, options: [], timer: 30, hideUntilReveal: true },
    sources,
    players,
    shuffle: identityShuffle,
  })
}

describe('fibvote derive', () => {
  it('mixes the lies with the injected truth and withholds which option is true', () => {
    const { publish, answer } = deriveWith(
      new Map<string, unknown>([
        ['A', { text: 'congress' }],
        ['B', { text: 'murder' }],
      ]),
    )
    // lies first (source order), then the truth appended, all under identity shuffle.
    expect(publish.options).toEqual([
      { id: 'o0', text: 'congress' },
      { id: 'o1', text: 'murder' },
      { id: 'o2', text: 'parliament' },
    ])
    // The truth is never published in the content.
    expect((publish as { truth?: string }).truth).toBe('')
    const ans = answer as FibAnswer
    expect(ans.truthId).toBe('o2')
    expect(ans.authors).toEqual({ o0: 'A', o1: 'B' }) // the truth option has no author
    // The make-round prompt (the question) frames the vote.
    expect(publish.prompt).toBe('A group of owls is called a ___.')
  })

  it('drops a lie that equals the truth so the true option is not duplicated', () => {
    const { publish, answer } = deriveWith(
      new Map<string, unknown>([
        ['A', { text: 'Parliament.' }], // matches the truth (case/punctuation-insensitive)
        ['B', { text: 'flock' }],
      ]),
    )
    expect(publish.options).toEqual([
      { id: 'o0', text: 'flock' },
      { id: 'o1', text: 'parliament' },
    ])
    const ans = answer as FibAnswer
    expect(ans.truthId).toBe('o1')
    expect(ans.authors).toEqual({ o0: 'B' }) // A's truth-matching lie was dropped
  })

  it('still injects the truth when nobody submitted a lie', () => {
    const { publish, answer } = deriveWith(new Map())
    expect(publish.options).toEqual([{ id: 'o0', text: 'parliament' }])
    expect((answer as FibAnswer).truthId).toBe('o0')
  })
})

describe('fibvote aggregate (dual-axis scoring)', () => {
  it('rewards truth-finders and rewards liars per player fooled', () => {
    const { publish, answer } = deriveWith(
      new Map<string, unknown>([
        ['A', { text: 'congress' }],
        ['B', { text: 'murder' }],
      ]),
    )
    // o0=A congress, o1=B murder, o2=truth parliament.
    // A votes the truth (finds it). B votes A's lie (fooled by A). C votes A's lie too.
    const votes = new Map<string, FibInput>([
      ['A', { choice: 'o2' }],
      ['B', { choice: 'o0' }],
      ['C', { choice: 'o0' }],
    ])
    const ctx: BlockResultsContext<FibContent, FibInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const frag = fibBlock.aggregate!(ctx)
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Ada).toBe(2000) // found the truth (1000) + fooled 2 players (2x500)
    expect(board.Bea).toBe(0) // fooled, and her lie drew no votes
    expect(board.Cy).toBe(0)
    // Best-fibber award goes to Ada (fooled 2).
    expect(frag.awards?.[0]).toMatchObject({ label: 'Best fibber', subject: 'Ada' })
  })

  it('ignores a self-vote for your own lie', () => {
    const { publish, answer } = deriveWith(new Map<string, unknown>([['A', { text: 'congress' }]]))
    // o0=A congress, o1=truth. A votes its OWN lie (ignored); B finds the truth.
    const votes = new Map<string, FibInput>([
      ['A', { choice: 'o0' }],
      ['B', { choice: 'o1' }],
    ])
    const frag = fibBlock.aggregate!({
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    })
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Ada).toBe(0) // self-vote doesn't fool anyone
    expect(board.Bea).toBe(1000) // found the truth
  })

  it('doubles the final round', () => {
    const { publish, answer } = deriveWith(new Map<string, unknown>([['A', { text: 'congress' }]]))
    const votes = new Map<string, FibInput>([['B', { choice: 'o1' }]]) // B finds the truth each round
    const frag = fibBlock.aggregate!({
      rounds: [
        { index: 1, content: publish },
        { index: 3, content: publish },
      ],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    })
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Bea).toBe(3000) // 1000 + final-round x2 (2000)
  })
})

describe('fibvote revealSummary', () => {
  it('marks the truth and counts votes per option', () => {
    const { publish, answer } = deriveWith(new Map<string, unknown>([['A', { text: 'congress' }]]))
    const votes = new Map<string, FibInput>([
      ['B', { choice: 'o0' }], // fooled by A's lie
      ['C', { choice: 'o1' }], // found the truth
    ])
    const ctx: RevealContext<FibContent, FibInput> = { content: publish, inputs: votes, answer, players }
    const summary = fibBlock.revealSummary!(ctx) as FibRevealSummary
    expect(summary.truthText).toBe('parliament')
    expect(summary.authors).toEqual({ o0: 'A' }) // option->author map exposed at reveal
    const truth = summary.options.find((o) => o.isTruth)
    expect(truth).toMatchObject({ text: 'parliament', votes: 1, author: null })
    const lie = summary.options.find((o) => !o.isTruth)
    expect(lie).toMatchObject({ text: 'congress', votes: 1, author: 'Ada' })
  })
})

describe('fibvote redaction', () => {
  it('strips the truth and options from published content', () => {
    const redacted = fibBlock.redactContent!({
      prompt: 'Q',
      truth: 'parliament',
      options: [{ id: 'o0', text: 'x' }],
      timer: 30,
      hideUntilReveal: true,
    })
    expect(redacted.truth).toBe('')
    expect(redacted.options).toEqual([])
  })
})

describe('fibvote timeout safety net', () => {
  // A submits a lie; B and C are eligible non-submitters and get a canned safety lie.
  function deriveWithPool() {
    return fibBlock.derive!({
      content: { prompt: 'Which is TRUE?', truth: 'parliament', options: [], timer: 30, hideUntilReveal: true },
      sources: [
        {
          index: 0,
          content: { prompt: 'A group of owls is called a ___.', safetyAnswers: ['flock'] },
          inputs: new Map<string, unknown>([['A', { text: 'congress' }]]),
          render: textRender,
        },
      ],
      players,
      shuffle: identityShuffle,
    })
  }

  it('gives eligible non-submitters a safety lie, flagged and never the truth', () => {
    const { publish, answer } = deriveWithPool()
    const ans = answer as FibAnswer
    expect(publish.options.length).toBe(4) // A's lie + B/C safety + the truth
    expect(ans.safety?.length).toBe(2)
    for (const id of ans.safety!) {
      expect(id).not.toBe(ans.truthId)
      expect(ans.authors[id]).toBeTruthy()
    }
  })

  it('scores a safety liar at half', () => {
    const { publish, answer } = deriveWithPool()
    const ans = answer as FibAnswer
    const sid = ans.safety![0]!
    const liar = ans.authors[sid]!
    // Two voters fall for the safety lie: liarPoints(2)=1000, halved -> 500.
    const votes = new Map<string, FibInput>([
      ['x', { choice: sid }],
      ['y', { choice: sid }],
    ])
    const ctx: BlockResultsContext<FibContent, FibInput> = {
      rounds: [{ index: 1, content: publish }],
      inputsFor: () => votes,
      answerFor: () => answer,
      players,
    }
    const board = Object.fromEntries((fibBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.id, e.score]))
    expect(board[liar]).toBe(500)
  })
})
