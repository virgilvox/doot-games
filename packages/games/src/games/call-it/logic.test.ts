import { describe, expect, it } from 'vitest'
import { applyScores, callBoard, isPlayableSpec, scoreCall, tallyPicks } from './logic'

describe('tallyPicks', () => {
  it('counts picks per option and ignores out-of-range', () => {
    const picks = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 1],
      ['d', 5], // out of range
    ])
    expect(tallyPicks(picks, 2)).toEqual([1, 2])
  })
})

describe('scoreCall', () => {
  it('awards correct callers and nobody else', () => {
    const picks = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ])
    const out = scoreCall(picks, 0)
    expect(out.get('a')).toBe(100)
    expect(out.get('c')).toBe(100)
    expect(out.has('b')).toBe(false)
  })

  it('scores nobody on a voided call (null or negative outcome)', () => {
    const picks = new Map([['a', 0]])
    expect(scoreCall(picks, null).size).toBe(0)
    expect(scoreCall(picks, -1).size).toBe(0)
  })
})

describe('applyScores + callBoard', () => {
  it('accumulates across calls and builds a sorted board with everyone present', () => {
    const roster = [
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'Bo' },
      { id: 'c', name: 'Cy' },
    ]
    const totals = new Map<string, number>()
    applyScores(totals, scoreCall(new Map([['a', 0], ['b', 1]]), 0)) // a right
    applyScores(totals, scoreCall(new Map([['a', 1], ['b', 1]]), 1)) // a + b right
    const board = callBoard(totals, new Map(), roster)
    expect(board[0]).toEqual({ id: 'a', name: 'Ann', score: 200 })
    expect(board[1]).toEqual({ id: 'b', name: 'Bo', score: 100 })
    expect(board[2]).toEqual({ id: 'c', name: 'Cy', score: 0 })
  })
})

describe('isPlayableSpec', () => {
  it('requires a prompt and at least two distinct, non-empty options', () => {
    expect(isPlayableSpec({ prompt: 'Will it?', options: ['Yes', 'No'] })).toBe(true)
    expect(isPlayableSpec({ prompt: '', options: ['Yes', 'No'] })).toBe(false)
    expect(isPlayableSpec({ prompt: 'Will it?', options: ['Yes'] })).toBe(false)
    expect(isPlayableSpec({ prompt: 'Will it?', options: ['Yes', 'Yes'] })).toBe(false)
    expect(isPlayableSpec({ prompt: 'Will it?', options: ['Yes', '  '] })).toBe(false)
  })
})
