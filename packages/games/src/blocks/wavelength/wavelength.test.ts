import type { AssignContext, BlockResultsContext, DeriveContext, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import {
  type WavelengthAnswer,
  type WavelengthContent,
  type WavelengthInput,
  type WavelengthSecret,
  wavelengthBlock,
} from './block'
import { scoreWavelength } from './logic'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bo', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const idShuffle = <T>(x: T[]): T[] => x

describe('scoreWavelength', () => {
  it('rewards a guess near the target and starves a far one', () => {
    const { perGuesser, clueGiverPoints } = scoreWavelength(80, new Map([['B', 80], ['C', 30]]))
    expect(perGuesser.get('B')!).toBeGreaterThan(perGuesser.get('C')!)
    expect(perGuesser.get('B')!).toBeGreaterThan(0)
    // The clue-giver earns the average of the guessers' closeness.
    expect(clueGiverPoints).toBeGreaterThan(0)
    expect(clueGiverPoints).toBeLessThan(perGuesser.get('B')!) // pulled down by C's miss
  })
  it('a perfect room maxes the clue-giver; an empty room scores them zero', () => {
    expect(scoreWavelength(50, new Map([['B', 50], ['C', 50]])).clueGiverPoints).toBeGreaterThan(0)
    expect(scoreWavelength(50, new Map()).clueGiverPoints).toBe(0)
  })
})

describe('wavelength assignContent', () => {
  const clueCtx = (item: number): AssignContext<WavelengthContent> => ({
    content: { phase: 'clue', leftLabel: 'Cold', rightLabel: 'Hot', target: 80, item, timer: 45 },
    players,
    shuffle: idShuffle,
    sources: [],
  })

  it('the CLUE round shows ONLY the rotating clue-giver the target, and withholds who/what', () => {
    const out = wavelengthBlock.assignContent!(clueCtx(0)) // ring [A,B,C], item 0 -> Ada
    const pp = out.perPlayer as unknown as Record<string, WavelengthSecret>
    expect(pp.A).toMatchObject({ isGiver: true, target: 80 })
    expect(pp.B).toMatchObject({ isGiver: false })
    expect(pp.B.target).toBeUndefined() // a guesser never sees the target
    expect((out.answer as WavelengthAnswer)).toEqual({ clueGiverPid: 'A', target: 80 })
  })

  it('rotates the clue-giver by item', () => {
    expect((wavelengthBlock.assignContent!(clueCtx(1)).answer as WavelengthAnswer).clueGiverPid).toBe('B')
    expect((wavelengthBlock.assignContent!(clueCtx(2)).answer as WavelengthAnswer).clueGiverPid).toBe('C')
  })

  it('the GUESS round reads the clue round (the P7 foundation) and overrides ONLY the clue-giver', () => {
    const out = wavelengthBlock.assignContent!({
      content: { phase: 'guess', leftLabel: 'Cold', rightLabel: 'Hot', target: 80, item: 0, timer: 45 },
      players,
      shuffle: idShuffle,
      // the prior clue round: its inputs (the clue) + its withheld answer (who + target)
      sources: [
        {
          index: 0,
          content: { phase: 'clue' },
          inputs: new Map<string, unknown>([['A', { clue: 'fresh coffee' }]]),
          answer: { clueGiverPid: 'A', target: 80 } satisfies WavelengthAnswer,
          render: () => '',
        },
      ],
    })
    const pp = out.perPlayer as unknown as Record<string, WavelengthSecret>
    expect(Object.keys(pp)).toEqual(['A']) // only the clue-giver gets a per-player view
    expect(pp.A).toMatchObject({ phase: 'guess', isGiver: true, clue: 'fresh coffee', target: 80 })
  })
})

describe('wavelength derive (guess) + aggregate', () => {
  function guessRound() {
    return wavelengthBlock.derive!({
      content: { phase: 'guess', leftLabel: 'Cold', rightLabel: 'Hot', target: 80, item: 0, timer: 45 },
      players,
      shuffle: idShuffle,
      sources: [
        {
          index: 0,
          content: { phase: 'clue' },
          inputs: new Map<string, unknown>([['A', { clue: 'fresh coffee' }]]),
          answer: { clueGiverPid: 'A', target: 80 } satisfies WavelengthAnswer,
          render: () => '',
        },
      ],
    } as DeriveContext<WavelengthContent>)
  }

  it('publishes the clue + poles with the target stripped, and withholds the answer', () => {
    const { publish, answer } = guessRound()
    expect(publish).toMatchObject({ phase: 'guess', clue: 'fresh coffee', target: -1 })
    expect(answer).toEqual({ clueGiverPid: 'A', target: 80 })
  })

  it('scores guessers by closeness and the clue-giver by the room, skipping clue rounds', () => {
    const answer = { clueGiverPid: 'A', target: 80 } satisfies WavelengthAnswer
    const inputs: Record<number, Map<string, WavelengthInput>> = {
      1: new Map([
        ['A', { value: 80 }], // the clue-giver's own value is ignored
        ['B', { value: 80 }], // perfect
        ['C', { value: 20 }], // far
      ]),
    }
    const ctx: BlockResultsContext<WavelengthContent, WavelengthInput> = {
      rounds: [
        { index: 0, content: { phase: 'clue', leftLabel: 'Cold', rightLabel: 'Hot', target: 80, item: 0, timer: 45 } },
        { index: 1, content: { phase: 'guess', leftLabel: 'Cold', rightLabel: 'Hot', target: 80, item: 0, timer: 45 } },
      ],
      inputsFor: (i) => inputs[i] ?? new Map(),
      answerFor: (i) => (i === 1 ? answer : undefined),
      players,
    }
    const board = Object.fromEntries((wavelengthBlock.aggregate!(ctx).leaderboard ?? []).map((e) => [e.name, e.score]))
    expect(board.Bo).toBeGreaterThan(board.Cy) // the close guesser beats the far one
    expect(board.Ada).toBeGreaterThan(0) // the clue-giver scored from the room's reads
  })
})
