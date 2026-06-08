import { describe, expect, it } from 'vitest'
import { type SpectrumInput, scoreSpectrum } from './logic'

const inputs = (vals: Record<string, number | null>) =>
  new Map<string, SpectrumInput>(Object.entries(vals).map(([pid, value]) => [pid, { value }]))

describe('scoreSpectrum', () => {
  it('computes the consensus (mean) and scores closeness to it', () => {
    const { scores, mean } = scoreSpectrum(inputs({ A: 40, B: 50, C: 60 }))
    expect(mean).toBe(50)
    // B is exactly on the mean -> full; A and C are 10 off -> 1 - 10/50 = 0.8.
    expect(scores.get('B')).toBe(1000)
    expect(scores.get('A')).toBe(800)
    expect(scores.get('C')).toBe(800)
  })

  it('gives full points to everyone when the room agrees exactly', () => {
    const { scores, mean } = scoreSpectrum(inputs({ A: 70, B: 70 }))
    expect(mean).toBe(70)
    expect(scores.get('A')).toBe(1000)
    expect(scores.get('B')).toBe(1000)
  })

  it('does NOT zero out everyone for a 2-player split (the field-relative trap)', () => {
    // A=20, B=80 -> mean 50, each 30 off -> 1 - 30/50 = 0.4 -> 400 (both score).
    const { scores } = scoreSpectrum(inputs({ A: 20, B: 80 }))
    expect(scores.get('A')).toBe(400)
    expect(scores.get('B')).toBe(400)
  })

  it('scores 0 for a placement half the scale or more from consensus', () => {
    // mean of {50,50,0} ~= 33.3; the outlier at 0 is 33 off -> still scores some;
    // an extreme split: {0, 100} -> mean 50, each 50 off -> 0.
    const { scores } = scoreSpectrum(inputs({ A: 0, B: 100 }))
    expect(scores.get('A')).toBe(0)
    expect(scores.get('B')).toBe(0)
  })

  it('ignores players who did not place a mark', () => {
    const { scores, marks } = scoreSpectrum(inputs({ A: 50, B: null }))
    expect(marks).toHaveLength(1)
    expect(scores.get('A')).toBe(1000)
    expect(scores.has('B')).toBe(false)
  })

  it('is empty when nobody placed a mark', () => {
    const { scores, mean } = scoreSpectrum(inputs({ A: null }))
    expect(mean).toBeNull()
    expect(scores.size).toBe(0)
  })
})
