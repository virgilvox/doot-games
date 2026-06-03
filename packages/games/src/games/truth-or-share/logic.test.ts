/**
 * Pure tests for Truth or Share: rotation, prompt dealing, reaction tally, and the
 * reaction-cut scoring with its consent-friendly edges (a pass never scores or
 * penalizes; the picker only profits from a real answer).
 */
import { describe, expect, it } from 'vitest'
import {
  type ReactionKind,
  type TurnInput,
  type TurnState,
  countReactions,
  dealPrompts,
  leaderboard,
  pickerFor,
  redactTurnForPublish,
  scoreTurn,
} from './logic'

describe('pickerFor', () => {
  const order = ['a', 'b', 'c']
  it('rotates through the order and wraps', () => {
    expect([0, 1, 2, 3, 4].map((i) => pickerFor(order, i))).toEqual(['a', 'b', 'c', 'a', 'b'])
  })
  it('is undefined for an empty room', () => {
    expect(pickerFor([], 0)).toBeUndefined()
  })
})

describe('dealPrompts', () => {
  const deck = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
  it('deals a fixed-size hand, deterministic per seed+turn (reconnect-safe)', () => {
    const a = dealPrompts(deck, 'ROOM', 0, 3)
    expect(a).toHaveLength(3)
    expect(dealPrompts(deck, 'ROOM', 0, 3)).toEqual(a) // stable
    expect(dealPrompts(deck, 'ROOM', 1, 3)).not.toEqual(a) // different turn differs
  })
  it('caps to the deck size and handles an empty deck', () => {
    expect(dealPrompts(['only'], 'ROOM', 0, 3)).toEqual(['only'])
    expect(dealPrompts([], 'ROOM', 0, 3)).toEqual([])
  })
})

describe('countReactions', () => {
  it('counts per kind plus a total', () => {
    const r: ReactionKind[] = ['laugh', 'laugh', 'love', 'wow', 'oof', 'oof']
    expect(countReactions(r)).toEqual({ laugh: 2, love: 1, wow: 1, oof: 2, total: 6 })
  })
})

describe('scoreTurn (reaction-cut)', () => {
  it('pays the target per reaction and the picker a 50% cut', () => {
    expect(scoreTurn({ pickerPid: 'p', targetPid: 't', passed: false, reactions: 4 })).toEqual({
      targetPts: 40,
      pickerPts: 20,
    })
  })
  it('floors the picker cut on an odd count', () => {
    expect(scoreTurn({ pickerPid: 'p', targetPid: 't', passed: false, reactions: 3 })).toEqual({
      targetPts: 30,
      pickerPts: 15,
    })
    expect(scoreTurn({ pickerPid: 'p', targetPid: 't', passed: false, reactions: 1 })).toEqual({
      targetPts: 10,
      pickerPts: 5,
    })
  })
  it('scores nothing for a pass (consent is never punished)', () => {
    expect(scoreTurn({ pickerPid: 'p', targetPid: 't', passed: true, reactions: 9 })).toEqual({ targetPts: 0, pickerPts: 0 })
  })
  it('scores nothing when no one reacted (no points, no penalty)', () => {
    expect(scoreTurn({ pickerPid: 'p', targetPid: 't', passed: false, reactions: 0 })).toEqual({ targetPts: 0, pickerPts: 0 })
  })
})

describe('redactTurnForPublish (answer withholding)', () => {
  const base: TurnState = {
    i: 0,
    total: 5,
    phase: 'respond',
    pickerPid: 'a',
    pickerName: 'Ada',
    target: { pid: 'b', name: 'Bo' },
    prompt: 'a prompt',
    response: 'the answer',
  }
  it('hides a truth answer until the target chooses to share it (react)', () => {
    for (const phase of ['pick', 'mode', 'prompt', 'respond'] as const) {
      expect(redactTurnForPublish({ ...base, phase }).response).toBeNull()
    }
  })
  it('lets the answer through at react/result', () => {
    expect(redactTurnForPublish({ ...base, phase: 'react' }).response).toBe('the answer')
    expect(redactTurnForPublish({ ...base, phase: 'result' }).response).toBe('the answer')
  })
})

describe('leaderboard', () => {
  const roster = [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bo' },
    { id: 'c', name: 'Cy' },
  ]
  it('sums target and picker earnings across turns and includes everyone', () => {
    const turns: TurnInput[] = [
      { pickerPid: 'a', targetPid: 'b', passed: false, reactions: 4 }, // b +40, a +20
      { pickerPid: 'b', targetPid: 'c', passed: false, reactions: 2 }, // c +20, b +10
      { pickerPid: 'c', targetPid: 'a', passed: true, reactions: 5 }, // pass: nothing
    ]
    const board = leaderboard(turns, new Map(), roster)
    const score = (id: string) => board.find((r) => r.id === id)?.score ?? 0
    expect(score('b')).toBe(50) // 40 target + 10 picker
    expect(score('a')).toBe(20) // picker cut only
    expect(score('c')).toBe(20) // target only
    expect(board.map((r) => r.id)).toEqual(['b', 'a', 'c']) // sorted by score
  })
})
