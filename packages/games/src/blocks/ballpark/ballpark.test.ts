import type { BlockResultsContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  CLOSEST_BONUS,
  type BallparkContent,
  type BallparkInput,
  type BallparkRevealSummary,
  ballparkBlock,
  ballparkBounds,
  ballparkCloseness,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const content: BallparkContent = { subject: '', prompt: 'How many?', image: '', unit: '', answer: 100, timer: 30 }
const key = { answer: 100 }

describe('ballparkCloseness', () => {
  it('is 1 for the closest, 0 for the worst, full when everyone nails it', () => {
    expect(ballparkCloseness(0, 50)).toBe(1)
    expect(ballparkCloseness(50, 50)).toBe(0)
    expect(ballparkCloseness(25, 50)).toBe(0.5)
    expect(ballparkCloseness(0, 0)).toBe(1)
  })
})

describe('ballparkBounds (outlier-robust dial)', () => {
  it('a lone wild guess does not blow out the dial', () => {
    // answer 100; two sensible guesses (90,110) and one absurd one (999999).
    const { lo, hi } = ballparkBounds(100, [90, 110, 999999])
    // The dial stays tight around the pack; the outlier will clamp to the edge.
    expect(hi).toBeLessThan(1000)
    expect(lo).toBeLessThan(90)
    expect(hi).toBeGreaterThan(110)
  })

  it('a tight pack keeps a tight dial (never exceeds the worst guess)', () => {
    const { lo, hi } = ballparkBounds(100, [95, 105])
    expect(lo).toBeGreaterThan(80)
    expect(hi).toBeLessThan(120)
  })

  it('pads around the answer when everyone nailed it', () => {
    const { lo, hi } = ballparkBounds(100, [100, 100])
    expect(lo).toBeLessThan(100)
    expect(hi).toBeGreaterThan(100)
  })

  it('handles no guesses', () => {
    const { lo, hi } = ballparkBounds(50, [])
    expect(lo).toBeLessThan(50)
    expect(hi).toBeGreaterThan(50)
  })
})

describe('ballpark aggregate', () => {
  it('rewards closeness and gives the closest a bullseye bonus', () => {
    // answer 100; A guesses 90 (err 10, closest), B 120 (err 20), C 200 (err 100, worst).
    const inputs = new Map<string, BallparkInput>([
      ['A', { value: 90 }],
      ['B', { value: 120 }],
      ['C', { value: 200 }],
    ])
    const ctx: BlockResultsContext<BallparkContent, BallparkInput> = {
      rounds: [{ index: 0, content }],
      inputsFor: () => inputs,
      answerFor: () => key,
      players,
    }
    const frag = ballparkBlock.aggregate!(ctx)
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    // maxErr=100. closeness: A=(100-10)/100=0.9 ->900 +250 bonus =1150; B=(100-20)/100=0.8 ->800; C=0.
    expect(board.Ada).toBe(900 + CLOSEST_BONUS)
    expect(board.Bea).toBe(800)
    expect(board.Cy).toBe(0)
    expect(frag.headline).toBe('Ada has the best eye')
  })

  it('ignores players who did not guess', () => {
    const inputs = new Map<string, BallparkInput>([
      ['A', { value: 100 }],
      ['B', { value: null }],
    ])
    const frag = ballparkBlock.aggregate!({
      rounds: [{ index: 0, content }],
      inputsFor: () => inputs,
      answerFor: () => key,
      players,
    })
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    // Only A guessed -> maxErr 0 -> closeness 1 -> 1000 + bonus.
    expect(board.Ada).toBe(1000 + CLOSEST_BONUS)
    expect(board.Bea).toBe(0)
  })
})

describe('ballpark revealSummary', () => {
  it('reports the answer, sorted marks, and the closest pid', () => {
    const inputs = new Map<string, BallparkInput>([
      ['A', { value: 120 }],
      ['B', { value: 95 }],
    ])
    const ctx: RevealContext<BallparkContent, BallparkInput> = { content, inputs, answer: key, players }
    const s = ballparkBlock.revealSummary!(ctx) as BallparkRevealSummary
    expect(s.answer).toBe(100)
    expect(s.closestPid).toBe('B') // 95 is closer to 100 than 120
    expect(s.marks.map((m) => m.value)).toEqual([95, 120]) // sorted ascending
    expect(s.lo).toBeLessThan(95)
    expect(s.hi).toBeGreaterThan(120)
  })
})

describe('ballpark redaction', () => {
  it('strips the answer from published content', () => {
    const redacted = ballparkBlock.redactContent!({ ...content, answer: 100 })
    expect(redacted.answer).toBeNull()
  })
})
