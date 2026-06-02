import type { BlockResultsContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  type HivemindContent,
  type HivemindInput,
  type HivemindRevealSummary,
  clusterAnswers,
  hivemindBlock,
  hivemindShare,
  normalizeAnswer,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
  { id: 'D', name: 'Dot', joinedAtIndex: 0 },
]

const content: HivemindContent = { prompt: 'Name a fruit', placeholder: '', maxLength: 40, timer: 30 }

describe('hivemind normalizeAnswer', () => {
  it('is case/space/punctuation-insensitive and drops a leading article', () => {
    expect(normalizeAnswer('  The Beach! ')).toBe('beach')
    expect(normalizeAnswer('beach')).toBe('beach')
    expect(normalizeAnswer('A apple')).toBe('apple')
    expect(normalizeAnswer('an Orange.')).toBe('orange')
  })
})

describe('hivemind clusterAnswers', () => {
  it('groups identical answers and sorts biggest first; drops empties', () => {
    const inputs = new Map<string, HivemindInput>([
      ['A', { text: 'Apple' }],
      ['B', { text: 'apple' }],
      ['C', { text: 'the apple' }],
      ['D', { text: '' }],
    ])
    const clusters = clusterAnswers(inputs)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]?.pids.sort()).toEqual(['A', 'B', 'C'])
    expect(clusters[0]?.label).toBe('Apple') // first verbatim answer kept as label
  })
})

describe('hivemind hivemindShare', () => {
  it('zeroes a lone answer and gives full for unanimity', () => {
    expect(hivemindShare(1, 4)).toBe(0)
    expect(hivemindShare(4, 4)).toBe(1)
    expect(hivemindShare(3, 4)).toBeCloseTo(2 / 3)
    expect(hivemindShare(1, 1)).toBe(1) // solo play trivially matches
  })
})

describe('hivemind aggregate', () => {
  it('rewards matching the crowd and zeroes the lone wolf', () => {
    // A,B,C say apple (cluster of 3); D says durian alone.
    const inputs = new Map<string, HivemindInput>([
      ['A', { text: 'apple' }],
      ['B', { text: 'Apple' }],
      ['C', { text: 'apple' }],
      ['D', { text: 'durian' }],
    ])
    const ctx: BlockResultsContext<HivemindContent, HivemindInput> = {
      rounds: [{ index: 0, content }],
      inputsFor: () => inputs,
      answerFor: () => undefined,
      players,
    }
    const frag = hivemindBlock.aggregate!(ctx)
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    // total=4; apple cluster size 3 -> (3-1)/(4-1)=2/3 -> 667; durian size 1 -> 0.
    expect(board.Ada).toBe(667)
    expect(board.Bea).toBe(667)
    expect(board.Cy).toBe(667)
    expect(board.Dot).toBe(0)
  })
})

describe('hivemind revealSummary', () => {
  it('reports clusters and the top label', () => {
    const inputs = new Map<string, HivemindInput>([
      ['A', { text: 'apple' }],
      ['B', { text: 'apple' }],
      ['C', { text: 'pear' }],
    ])
    const ctx: RevealContext<HivemindContent, HivemindInput> = {
      content,
      inputs,
      answer: undefined,
      players,
    }
    const summary = hivemindBlock.revealSummary!(ctx) as HivemindRevealSummary
    expect(summary.topLabel).toBe('apple')
    expect(summary.clusters[0]).toEqual({ label: 'apple', count: 2 })
    expect(summary.clusterSizeOf.A).toBe(2)
    expect(summary.clusterSizeOf.C).toBe(1)
  })
})
