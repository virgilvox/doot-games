import { describe, expect, it } from 'vitest'
import { autoMaxEdits, editDistance, foldDiacritics, matchAnswer, matchKey, normalizeAnswer } from './text-match'

describe('normalizeAnswer', () => {
  it('is case/space/punctuation-insensitive and drops a leading article', () => {
    expect(normalizeAnswer('  The Beach! ')).toBe('beach')
    expect(normalizeAnswer('an Orange.')).toBe('orange')
    expect(normalizeAnswer('A apple')).toBe('apple')
  })
  it('keeps digits and inner words', () => {
    expect(normalizeAnswer('Apollo 11')).toBe('apollo 11')
    expect(normalizeAnswer('1984')).toBe('1984')
  })
  it('is empty for punctuation-only input', () => {
    expect(normalizeAnswer('!?.')).toBe('')
    expect(normalizeAnswer('')).toBe('')
  })
})

describe('foldDiacritics', () => {
  it('strips accents but keeps the base letters', () => {
    expect(foldDiacritics('Beyoncé')).toBe('Beyonce')
    expect(foldDiacritics('Pelé')).toBe('Pele')
    expect(foldDiacritics('naïve résumé')).toBe('naive resume')
  })
})

describe('matchKey', () => {
  it('folds accents then normalizes', () => {
    expect(matchKey('  Café! ')).toBe('cafe')
    expect(matchKey('The Pelé')).toBe('pele')
  })
})

describe('editDistance', () => {
  it('counts single edits', () => {
    expect(editDistance('einstein', 'einstien')).toBe(2) // transposition = 2 substitutions
    expect(editDistance('color', 'colour')).toBe(1)
    expect(editDistance('cat', 'cat')).toBe(0)
  })
  it('bails out past the budget with max+1', () => {
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2)
    expect(editDistance('a', 'aaaaaa', 1)).toBe(2) // length gap alone exceeds budget
  })
})

describe('autoMaxEdits', () => {
  it('forgives more typos on longer answers, none on very short ones', () => {
    expect(autoMaxEdits(3)).toBe(0)
    expect(autoMaxEdits(6)).toBe(1)
    expect(autoMaxEdits(12)).toBe(2)
  })
})

describe('matchAnswer', () => {
  it('matches exact answers ignoring case/space/punctuation/article', () => {
    expect(matchAnswer('the moon', ['Moon'])).toBe(true)
    expect(matchAnswer('  PARIS! ', ['paris'])).toBe(true)
  })
  it('matches any synonym in the accepted list', () => {
    expect(matchAnswer('NYC', ['New York City', 'NYC'])).toBe(true)
    expect(matchAnswer('new york city', ['New York City', 'NYC'])).toBe(true)
  })
  it('folds accents', () => {
    expect(matchAnswer('Beyonce', ['Beyoncé'])).toBe(true)
  })
  it('forgives a small typo on a long answer when fuzzy', () => {
    expect(matchAnswer('einsten', ['Einstein'])).toBe(true) // 1 deletion, len 8 -> budget 2
    expect(matchAnswer('colour', ['color'])).toBe(true) // len 5 -> budget 1
  })
  it('does not fuzzy-match short, genuinely different answers', () => {
    expect(matchAnswer('cat', ['bat'])).toBe(false) // len 3 -> budget 0
    expect(matchAnswer('dog', ['cat'])).toBe(false)
  })
  it('respects fuzzy:false and a custom maxEdits', () => {
    expect(matchAnswer('colour', ['color'], { fuzzy: false })).toBe(false)
    expect(matchAnswer('einstein', ['einstien'], { maxEdits: 1 })).toBe(false) // distance 2 > 1
  })
  it('is false for an empty guess or empty accepted list', () => {
    expect(matchAnswer('', ['moon'])).toBe(false)
    expect(matchAnswer('moon', [])).toBe(false)
    expect(matchAnswer('!?', ['moon'])).toBe(false)
  })
})
