import type { BlockResultsContext, RevealContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  type MostLikelyContent,
  type MostLikelyInput,
  type MostLikelyRevealSummary,
  mostLikelyBlock,
} from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bea', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const content: MostLikelyContent = { prompt: 'Most likely to win', timer: 20 }

describe('mostlikely revealSummary', () => {
  it('tallies nominations and crowns the room pick', () => {
    const inputs = new Map<string, MostLikelyInput>([
      ['A', { choice: 'C', name: 'Cy' }],
      ['B', { choice: 'C', name: 'Cy' }],
      ['C', { choice: 'A', name: 'Ada' }],
    ])
    const ctx: RevealContext<MostLikelyContent, MostLikelyInput> = {
      content,
      inputs,
      answer: undefined,
      players,
    }
    const s = mostLikelyBlock.revealSummary!(ctx) as MostLikelyRevealSummary
    expect(s.winnerName).toBe('Cy')
    expect(s.tallies[0]).toEqual({ pid: 'C', name: 'Cy', votes: 2 })
  })
})

describe('mostlikely aggregate', () => {
  it('leaderboard ranks most-nominated across rounds; everyone present appears', () => {
    const r0 = new Map<string, MostLikelyInput>([
      ['A', { choice: 'C', name: 'Cy' }],
      ['B', { choice: 'C', name: 'Cy' }],
    ])
    const r1 = new Map<string, MostLikelyInput>([
      ['A', { choice: 'C', name: 'Cy' }],
      ['C', { choice: 'B', name: 'Bea' }],
    ])
    const ctx: BlockResultsContext<MostLikelyContent, MostLikelyInput> = {
      rounds: [
        { index: 0, content },
        { index: 1, content },
      ],
      inputsFor: (i) => (i === 0 ? r0 : r1),
      answerFor: () => undefined,
      players,
    }
    const frag = mostLikelyBlock.aggregate!(ctx)
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Cy).toBe(3)
    expect(board.Bea).toBe(1)
    expect(board.Ada).toBe(0) // present, never nominated
    expect(frag.headline).toBe('Cy is most likely')
  })

  it('keeps a nominee named from the captured vote name when they left the roster', () => {
    const inputs = new Map<string, MostLikelyInput>([['A', { choice: 'Z', name: 'Zed' }]])
    const frag = mostLikelyBlock.aggregate!({
      rounds: [{ index: 0, content }],
      inputsFor: () => inputs,
      answerFor: () => undefined,
      players, // Z not in the roster anymore
    })
    const board = Object.fromEntries((frag.leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Zed).toBe(1)
  })
})
