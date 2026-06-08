import { describe, expect, it } from 'vitest'
import { type SurveyAnswer, type SurveyInput, parseBoard, scoreSurvey } from './logic'

const board: SurveyAnswer[] = [
  { text: 'Pepperoni', points: 35 },
  { text: 'Cheese', points: 25 },
  { text: 'Mushroom', points: 15 },
]

describe('scoreSurvey', () => {
  it('awards the points of each distinct board answer a player finds', () => {
    const inputs = new Map<string, SurveyInput>([
      ['A', { guesses: ['Pepperoni', 'Cheese'] }], // 35 + 25
      ['B', { guesses: ['mushroom'] }], // 15 (folded match)
      ['C', { guesses: ['Pineapple'] }], // not on the board -> 0
    ])
    const { scores, hits } = scoreSurvey(board, inputs)
    expect(scores.get('A')).toBe(60)
    expect(scores.get('B')).toBe(15)
    expect(scores.get('C')).toBeUndefined()
    expect(hits).toEqual([1, 1, 1]) // each found once
  })

  it('never double-counts the same board answer from two guesses', () => {
    const inputs = new Map<string, SurveyInput>([['A', { guesses: ['Cheese', 'cheese', 'CHEESE'] }]])
    const { scores, hits } = scoreSurvey(board, inputs)
    expect(scores.get('A')).toBe(25)
    expect(hits[1]).toBe(1)
  })

  it('forgives a small typo via the shared fuzzy matcher', () => {
    const inputs = new Map<string, SurveyInput>([['A', { guesses: ['Peperoni'] }]]) // 1 typo
    expect(scoreSurvey(board, inputs).scores.get('A')).toBe(35)
  })

  it('ignores empty guesses', () => {
    const inputs = new Map<string, SurveyInput>([['A', { guesses: ['', '  ', 'Cheese'] }]])
    expect(scoreSurvey(board, inputs).scores.get('A')).toBe(25)
  })
})

describe('parseBoard', () => {
  it('reads explicit points and falls back to rank-based points', () => {
    expect(parseBoard('Pepperoni:35 | Cheese:25')).toEqual([
      { text: 'Pepperoni', points: 35 },
      { text: 'Cheese', points: 25 },
    ])
    // Bare entries get descending rank points (first = highest).
    const ranked = parseBoard('A | B | C')
    expect(ranked.map((a) => a.points)).toEqual([15, 10, 5])
  })
  it('handles a colon inside the answer text (uses the LAST colon for points)', () => {
    expect(parseBoard('Ratio 1:1:10')).toEqual([{ text: 'Ratio 1:1', points: 10 }])
  })
  it('is empty for empty input', () => {
    expect(parseBoard('')).toEqual([])
  })
})
