import type { BlockResultsContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type AnswerContent, type AnswerInput, type AnswerRevealSummary, answerBlock } from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 1 }, // joined after round 0
]

const content: AnswerContent = {
  subject: '',
  prompt: 'Capital of France?',
  image: '',
  answers: ['Paris'],
  fuzzy: true,
  timer: 30,
}

function aggCtx(
  rounds: Array<{ index: number; content: AnswerContent }>,
  inputs: Record<number, Record<string, AnswerInput>>,
  answers: Record<number, { answers: string[] }>,
): BlockResultsContext<AnswerContent, AnswerInput> {
  return {
    rounds,
    inputsFor: (i) => new Map(Object.entries(inputs[i] ?? {})),
    answerFor: (i) => answers[i],
    players,
  }
}

describe('answer block withholding', () => {
  it('strips the accepted answers from published content and exposes them as the key', () => {
    expect(answerBlock.redactContent!(content)).toEqual({ ...content, answers: [] })
    expect(answerBlock.answerOf!(content)).toEqual({ answers: ['Paris'] })
  })
})

describe('answer block aggregate (correct-only scoring)', () => {
  it('scores tolerant matches and ignores wrong/missing, respecting eligibility', () => {
    const rounds = [{ index: 0, content }]
    const inputs = {
      0: {
        A: { text: 'paris' }, // exact (folded) -> correct
        B: { text: 'Lyon' }, // wrong
        C: { text: 'Paris' }, // ineligible for round 0 (joined at 1) -> not counted
      },
    }
    const frag = answerBlock.aggregate!(aggCtx(rounds, inputs, { 0: { answers: ['Paris'] } }))
    const board = Object.fromEntries(frag.leaderboard!.map((e) => [e.id, e]))
    expect(board.A!.score).toBe(1)
    expect(board.A!.detail).toBe('1 / 1')
    expect(board.B!.score).toBe(0)
    // Cy was not eligible for round 0, so 0 eligible rounds counted.
    expect(board.C!.detail).toBe('0 / 0')
  })

  it('forgives a small typo when fuzzy is on, and not when off', () => {
    const rounds = [{ index: 0, content }]
    const typo = { 0: { A: { text: 'Pariss' } } } // 1 extra char
    const on = answerBlock.aggregate!(aggCtx(rounds, typo, { 0: { answers: ['Paris'] } }))
    expect(on.leaderboard!.find((e) => e.id === 'A')!.score).toBe(1)

    const strict: AnswerContent = { ...content, fuzzy: false }
    const off = answerBlock.aggregate!(aggCtx([{ index: 0, content: strict }], typo, { 0: { answers: ['Paris'] } }))
    expect(off.leaderboard!.find((e) => e.id === 'A')!.score).toBe(0)
  })

  it('accepts any synonym in the answer list', () => {
    const c: AnswerContent = { ...content, prompt: 'Biggest US city?', answers: ['New York City', 'NYC'] }
    const rounds = [{ index: 0, content: c }]
    const inputs = { 0: { A: { text: 'nyc' }, B: { text: 'new york city!' } } }
    const frag = answerBlock.aggregate!(aggCtx(rounds, inputs, { 0: { answers: ['New York City', 'NYC'] } }))
    const board = Object.fromEntries(frag.leaderboard!.map((e) => [e.id, e]))
    expect(board.A!.score).toBe(1) // matches the NYC synonym
    expect(board.B!.score).toBe(1) // matches "New York City" after folding case/punctuation
  })
})

describe('answer block revealSummary', () => {
  it('grades each submission and reports the canonical answer + count', () => {
    const ctx: RevealContext<AnswerContent, AnswerInput> = {
      content,
      inputs: new Map<string, AnswerInput>([
        ['A', { text: 'Paris' }],
        ['B', { text: 'lyon' }],
        ['C', { text: '' }], // empty -> not a mark
      ]),
      answer: { answers: ['Paris'] },
      players,
    }
    const r = answerBlock.revealSummary!(ctx) as AnswerRevealSummary
    expect(r.answer).toBe('Paris')
    expect(r.accepted).toEqual(['Paris'])
    expect(r.total).toBe(2) // A and B typed something; C empty dropped
    expect(r.correctCount).toBe(1)
    expect(r.marks[0]!.correct).toBe(true) // correct sorted first
  })
})
