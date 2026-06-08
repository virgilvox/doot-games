import type { BlockResultsContext } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { BASE_BANKROLL, type WagerContent, type WagerInput, wagerBlock } from './block'

const players = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 1 }, // joined after round 0
]
const content: WagerContent = {
  subject: '',
  prompt: 'Q?',
  image: '',
  timer: 25,
  options: [{ label: 'A' }, { label: 'B' }],
  correct: 0,
}

function ctx(
  rounds: Array<{ index: number; content: WagerContent }>,
  inputs: Record<number, Record<string, WagerInput>>,
  answers: Record<number, { correct: number }>,
): BlockResultsContext<WagerContent, WagerInput> {
  return {
    rounds,
    inputsFor: (i) => new Map(Object.entries(inputs[i] ?? {})),
    answerFor: (i) => answers[i],
    players,
  }
}
const board = (frag: ReturnType<NonNullable<typeof wagerBlock.aggregate>>) =>
  Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.id, e.score]))

describe('wager block withholding', () => {
  it('strips the correct index and exposes it as the answer key', () => {
    expect(wagerBlock.redactContent!(content)).toEqual({ ...content, correct: -1 })
    expect(wagerBlock.answerOf!(content)).toEqual({ correct: 0 })
  })
})

describe('wager block aggregate (bet + bankroll)', () => {
  it('adds a winning bet and subtracts a losing one, off the base bankroll', () => {
    const frag = wagerBlock.aggregate!(
      ctx(
        [{ index: 0, content }],
        { 0: { A: { bet: 500, choice: 0 }, B: { bet: 300, choice: 1 } } }, // A right, B wrong
        { 0: { correct: 0 } },
      ),
    )
    const b = board(frag)
    expect(b.A).toBe(BASE_BANKROLL + 500) // 1500
    expect(b.B).toBe(BASE_BANKROLL - 300) // 700
  })

  it('accumulates across rounds and never drops below zero', () => {
    const rounds = [
      { index: 0, content },
      { index: 1, content },
    ]
    const frag = wagerBlock.aggregate!(
      ctx(
        rounds,
        {
          0: { A: { bet: 500, choice: 1 } }, // wrong -500 -> 500
          1: { A: { bet: 500, choice: 1 } }, // wrong -500 -> 0
        },
        { 0: { correct: 0 }, 1: { correct: 0 } },
      ),
    )
    expect(board(frag).A).toBe(0) // clamped, not negative (1000 - 500 - 500)
  })

  it('a no-answer round moves no money, and respects eligibility', () => {
    const frag = wagerBlock.aggregate!(
      ctx(
        [{ index: 0, content }],
        { 0: { A: { bet: 300, choice: null }, C: { bet: 500, choice: 0 } } },
        { 0: { correct: 0 } },
      ),
    )
    const b = board(frag)
    expect(b.A).toBe(BASE_BANKROLL) // didn't answer -> unchanged
    // Cy joined at round 1, so a round-0 bet doesn't count (ineligible).
    expect(b.C).toBe(BASE_BANKROLL)
  })

  it('clamps a tampered bet to a safe tier', () => {
    const frag = wagerBlock.aggregate!(
      ctx([{ index: 0, content }], { 0: { A: { bet: 999999, choice: 0 } } }, { 0: { correct: 0 } }),
    )
    expect(board(frag).A).toBe(BASE_BANKROLL + 300) // tampered bet -> default 300
  })
})
