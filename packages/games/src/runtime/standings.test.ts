import type { GameComposition, GamePlugin, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { guessBlock } from '../blocks/guess/block'
import { standingsThrough } from './standings'

// A tiny two-round guess game: round 0 correct = option 0, round 1 correct = option 1.
const plugin = {
  manifest: { id: 't', name: 'T', version: '0', author: 'x', capabilities: [] },
  blocks: [guessBlock],
  defaultConfig: { title: 'T', rounds: [] },
} as unknown as GamePlugin

const opts = [{ label: 'A' }, { label: 'B' }]
const config: GameComposition = {
  title: 'T',
  rounds: [
    { block: 'guess', content: { subject: '', prompt: 'q0', image: '', timer: null, hideUntilReveal: true, options: opts, correct: 0 } },
    { block: 'guess', content: { subject: '', prompt: 'q1', image: '', timer: null, hideUntilReveal: true, options: opts, correct: 1 } },
  ],
}

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
]

// A: right in both rounds. B: wrong in round 0, right in round 1.
const inputs: Record<number, Map<string, { choice: number }>> = {
  0: new Map([['A', { choice: 0 }], ['B', { choice: 1 }]]),
  1: new Map([['A', { choice: 1 }], ['B', { choice: 1 }]]),
}
const ctx = {
  inputsFor: (i: number) => inputs[i] ?? new Map(),
  players,
  answerKeys: { 0: { correct: 0 }, 1: { correct: 1 } } as Record<number, unknown>,
}

const scoreOf = (r: { leaderboard?: Array<{ id?: string; score: number }> }, id: string) =>
  r.leaderboard?.find((e) => e.id === id)?.score

describe('standingsThrough', () => {
  it('counts only rounds revealed so far (through round 0)', () => {
    const s = standingsThrough(plugin, config, 0, ctx)
    expect(scoreOf(s, 'A')).toBe(1)
    expect(scoreOf(s, 'B')).toBe(0)
  })

  it('accumulates as more rounds are revealed (through round 1)', () => {
    const s = standingsThrough(plugin, config, 1, ctx)
    expect(scoreOf(s, 'A')).toBe(2)
    expect(scoreOf(s, 'B')).toBe(1)
  })

  it('rolls up team standings between rounds when teams are on', () => {
    const teamed: ScorePlayer[] = [
      { id: 'A', name: 'Ada', joinedAtIndex: 0, team: 'Red' },
      { id: 'B', name: 'Bea', joinedAtIndex: 0, team: 'Blue' },
    ]
    const s = standingsThrough(plugin, config, 0, { ...ctx, players: teamed })
    expect(s.teamLeaderboard).toEqual([
      { team: 'Red', score: 1, members: 1 },
      { team: 'Blue', score: 0, members: 1 },
    ])
  })
})
