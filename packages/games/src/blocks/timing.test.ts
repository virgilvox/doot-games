import { describe, expect, it } from 'vitest'
import { scaleReadTimer } from './timing'

const story = (n: number) => 'My huge disgusting animal loves to procrastinate loudly. '.repeat(n).trim()

describe('scaleReadTimer', () => {
  it('keeps an untimed round untimed', () => {
    expect(scaleReadTimer(null, { texts: [story(4)] })).toBeNull()
    expect(scaleReadTimer(undefined, { texts: [story(4)] })).toBeNull()
  })

  it('keeps an explicit 0 (auto-lock) at 0', () => {
    expect(scaleReadTimer(0, { texts: [story(4)] })).toBe(0)
  })

  it('leaves a small gallery at the base timer', () => {
    expect(scaleReadTimer(30, { texts: ['Cats', 'A big dog'] })).toBe(30)
    expect(scaleReadTimer(30, {})).toBe(30)
    expect(scaleReadTimer(30, { images: 3 })).toBe(30)
  })

  it('grows with total text beyond the base budget', () => {
    const six = Array.from({ length: 6 }, () => story(2)) // 6 long mad-libs stories
    const scaled = scaleReadTimer(30, { texts: six })
    expect(scaled).toBeGreaterThan(40)
    // More players -> more text -> more time.
    const three = Array.from({ length: 3 }, () => story(2))
    expect(scaled as number).toBeGreaterThan(scaleReadTimer(30, { texts: three }) as number)
  })

  it('grows with image count beyond the first four', () => {
    expect(scaleReadTimer(30, { images: 4 })).toBe(30)
    expect(scaleReadTimer(30, { images: 10 })).toBe(42)
  })

  it('caps the stretch so a huge room cannot stall the night', () => {
    const wall = Array.from({ length: 20 }, () => story(6))
    expect(scaleReadTimer(30, { texts: wall })).toBe(75)
  })

  it('ignores undefined texts safely', () => {
    expect(scaleReadTimer(30, { texts: [undefined, 'hi', undefined] })).toBe(30)
  })
})
