import { describe, expect, it } from 'vitest'
import { type CategoriesContent, type CategoriesInput, scoreCategories, startsWithLetter } from './logic'

const content: CategoriesContent = {
  prompt: 'Categories',
  letter: 'C',
  categories: [
    { id: 'animal', label: 'An animal' },
    { id: 'food', label: 'A food' },
  ],
  timer: 120,
}

describe('startsWithLetter', () => {
  it('accepts a matching first letter, ignoring case + a leading article', () => {
    expect(startsWithLetter('Cat', 'C')).toBe(true)
    expect(startsWithLetter('cat', 'c')).toBe(true)
    expect(startsWithLetter('The Crab', 'C')).toBe(true) // article dropped
  })
  it('rejects a wrong letter or empty', () => {
    expect(startsWithLetter('Dog', 'C')).toBe(false)
    expect(startsWithLetter('', 'C')).toBe(false)
    expect(startsWithLetter('  ', 'C')).toBe(false)
  })
})

describe('scoreCategories', () => {
  it('scores a valid + UNIQUE answer, but not a duplicate (the Scattergories rule)', () => {
    const inputs = new Map<string, CategoriesInput>([
      ['A', { answers: { animal: 'Cat', food: 'Cake' } }],
      ['B', { answers: { animal: 'Cat', food: 'Cookie' } }], // animal Cat duplicates A
      ['C', { answers: { animal: 'Cheetah', food: 'Carrot' } }],
    ])
    const { scores, breakdown } = scoreCategories(content, inputs)
    // animal: Cat x2 -> 0 each; Cheetah unique -> 1 (C). food: Cake/Cookie/Carrot all unique -> 1 each.
    expect(scores.get('A')).toBe(1) // Cake only (Cat duplicated)
    expect(scores.get('B')).toBe(1) // Cookie only
    expect(scores.get('C')).toBe(2) // Cheetah + Carrot
    const animal = breakdown.find((b) => b.id === 'animal')!
    const cat = animal.entries.filter((e) => e.text.toLowerCase() === 'cat')
    expect(cat.every((e) => e.valid && !e.unique && !e.scored)).toBe(true)
    expect(animal.entries.find((e) => e.text === 'Cheetah')!.scored).toBe(true)
  })

  it('rejects an answer that does not start with the letter (invalid, 0 points)', () => {
    const inputs = new Map<string, CategoriesInput>([['A', { answers: { animal: 'Dog' } }]])
    const { scores, breakdown } = scoreCategories(content, inputs)
    expect(scores.get('A')).toBeUndefined()
    const e = breakdown.find((b) => b.id === 'animal')!.entries[0]!
    expect(e.valid).toBe(false)
    expect(e.scored).toBe(false)
  })

  it('folds case/spacing/articles together for the uniqueness test', () => {
    const inputs = new Map<string, CategoriesInput>([
      ['A', { answers: { animal: 'Crab' } }],
      ['B', { answers: { animal: 'the crab' } }], // same as A after the fold -> both 0
    ])
    const { scores } = scoreCategories(content, inputs)
    expect(scores.get('A')).toBeUndefined()
    expect(scores.get('B')).toBeUndefined()
  })

  it('ignores empty answers (a player who skipped a category)', () => {
    const inputs = new Map<string, CategoriesInput>([
      ['A', { answers: { animal: 'Cobra', food: '' } }],
    ])
    const { scores, breakdown } = scoreCategories(content, inputs)
    expect(scores.get('A')).toBe(1) // Cobra only
    expect(breakdown.find((b) => b.id === 'food')!.entries).toHaveLength(0)
  })
})
