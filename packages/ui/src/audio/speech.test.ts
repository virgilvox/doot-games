import { describe, expect, it } from 'vitest'
import { chunkText } from './speech'

/**
 * chunkText is the fix for the "stuck on the title card" freeze: a single
 * utterance that speaks longer than ~15s silently stalls in Chrome/macOS (it goes
 * quiet and `onend` fires tens of seconds late). Splitting long lines into short,
 * sentence-sized utterances keeps every one under the stall threshold. Pure, so
 * it is unit-tested here.
 */
describe('chunkText', () => {
  it('keeps a short single-sentence line as one chunk', () => {
    expect(chunkText('On the mic, Drive!')).toEqual(['On the mic, Drive!'])
  })

  it('splits a short line on sentence punctuation (each piece still speaks fine)', () => {
    expect(chunkText('Matchup 1. Drive versus Sparky!')).toEqual(['Matchup 1.', 'Drive versus Sparky!'])
  })

  it('splits a long multi-sentence line so no chunk exceeds the limit', () => {
    const welcome =
      'Welcome to the Circuit Cypher, where the bars are sharp and the beats are sharper! ' +
      'Tonight, our finest machines step to the mic to settle it the only way they know how. ' +
      'Two rappers enter, one rolls out the winner. Let the battle begin!'
    const chunks = chunkText(welcome)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120)
    // Nothing is dropped: every chunk is non-empty and the words survive.
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true)
    expect(chunks.join(' ')).toContain('Welcome to the Circuit Cypher')
    expect(chunks.join(' ')).toContain('Let the battle begin')
  })

  it('hard-wraps an over-long run with no sentence breaks', () => {
    const long = `${'word '.repeat(60).trim()}.` // ~300 chars, one sentence
    const chunks = chunkText(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120)
  })

  it('drops empty input to no chunks', () => {
    expect(chunkText('   ')).toEqual([])
    expect(chunkText('')).toEqual([])
  })
})
