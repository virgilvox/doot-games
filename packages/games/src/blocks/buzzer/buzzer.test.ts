import type { BlockResultsContext } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type BuzzerContent, type BuzzerInput, buzzerBlock, buzzerScore } from './block'

describe('buzzerScore', () => {
  it('awards nothing for a wrong answer', () => {
    expect(buzzerScore(100, false, 1000, 20000, false)).toBe(0)
    expect(buzzerScore(100, false, 0, 20000, true)).toBe(0)
  })
  it('awards the value plus a speed bonus (faster = more)', () => {
    // Instant correct answer: full value + full +50% speed.
    expect(buzzerScore(100, true, 0, 20000, false)).toBe(150)
    // Half the time elapsed: +25% speed.
    expect(buzzerScore(100, true, 10000, 20000, false)).toBe(125)
    // At the buzzer: no speed bonus.
    expect(buzzerScore(100, true, 20000, 20000, false)).toBe(100)
  })
  it('adds a +25% buzz bonus for the first correct answerer', () => {
    expect(buzzerScore(100, true, 20000, 20000, true)).toBe(125)
    expect(buzzerScore(200, true, 0, 20000, true)).toBe(200 + 100 + 50)
  })
  it('handles an untimed round (no speed bonus)', () => {
    expect(buzzerScore(100, true, 5000, 0, false)).toBe(100)
    expect(buzzerScore(100, true, 5000, 0, true)).toBe(125)
  })
})

describe('buzzer aggregate', () => {
  const content: BuzzerContent = {
    subject: 'Q',
    prompt: 'pick B',
    image: '',
    timer: 20,
    options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
    correct: 1,
    points: 100,
  }
  const players = [
    { id: 'p1', name: 'Ana', joinedAtIndex: 0 },
    { id: 'p2', name: 'Ben', joinedAtIndex: 0 },
    { id: 'p3', name: 'Cat', joinedAtIndex: 0 },
  ]
  // Ana: correct, slow. Ben: correct, fastest (buzz). Cat: wrong.
  const inputs = new Map<string, BuzzerInput>([
    ['p1', { choice: 1, ms: 18000 }],
    ['p2', { choice: 1, ms: 2000 }],
    ['p3', { choice: 0, ms: 1000 }],
  ])
  const ctx: BlockResultsContext<BuzzerContent, BuzzerInput> = {
    rounds: [{ index: 0, content }],
    inputsFor: () => inputs,
    answerFor: () => ({ correct: 1 }),
    players,
  }

  it('crowns the fastest correct answerer and scores by value + speed + buzz', () => {
    const frag = buzzerBlock.aggregate!(ctx)
    const lb = frag.leaderboard!
    // Ben buzzed in first (fastest correct): 100 + speed + 25 buzz bonus -> leads.
    expect(lb[0]?.name).toBe('Ben')
    expect(lb[0]!.score).toBeGreaterThan(lb[1]!.score)
    // Cat (wrong) scores 0.
    expect(lb.find((e) => e.name === 'Cat')?.score).toBe(0)
    // One buzz-in this round.
    expect(frag.stats?.find((s) => s.label === 'Buzz-ins')?.value).toBe(1)
  })

  it('withholds the correct index from the published content', () => {
    expect(buzzerBlock.redactContent!(content).correct).toBe(-1)
    expect(buzzerBlock.answerOf!(content)).toEqual({ correct: 1 })
  })

  it('never scores a wrong answer', () => {
    // Everyone answers, but only Ana and Ben are correct; Cat is wrong.
    const frag = buzzerBlock.aggregate!(ctx)
    const byName = Object.fromEntries(frag.leaderboard!.map((e) => [e.name, e]))
    expect(byName.Cat!.score).toBe(0)
    expect(byName.Cat!.detail).toBe('0 right')
    expect(byName.Ana!.score).toBeGreaterThan(0)
  })
})
