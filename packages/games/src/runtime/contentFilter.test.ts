import { describe, expect, it } from 'vitest'
import { maskDerivedPublish, maskText } from './contentFilter'

describe('maskText', () => {
  it('off leaves text untouched', () => {
    expect(maskText('what the hell', 'off')).toBe('what the hell')
  })

  it('moderate masks strong words but not mild ones, keeping length', () => {
    expect(maskText('this is shit', 'moderate')).toBe('this is ••••')
    expect(maskText('what the hell', 'moderate')).toBe('what the hell') // mild: untouched at moderate
  })

  it('strict additionally masks mild words', () => {
    expect(maskText('what the hell', 'strict')).toBe('what the ••••')
    expect(maskText('this is shit', 'strict')).toBe('this is ••••')
  })

  it('matches whole words only (no Scunthorpe false positives)', () => {
    expect(maskText('a classic assessment', 'strict')).toBe('a classic assessment') // "ass" not matched inside words
    expect(maskText('grass and bass', 'strict')).toBe('grass and bass')
  })

  it('is case-insensitive', () => {
    expect(maskText('SHIT happens', 'moderate')).toBe('•••• happens')
  })

  it('catches obfuscated profanity (leetspeak) - the reason for the obscenity library', () => {
    const masked = maskText('you sh1t', 'moderate')
    expect(masked).not.toContain('sh1t')
    expect(masked).toContain('•')
  })
})

describe('maskDerivedPublish', () => {
  it('masks vote option text and split scenario text', () => {
    const vote = maskDerivedPublish({ prompt: 'P', options: [{ id: 'o0', text: 'clean' }, { id: 'o1', text: 'shit take' }] }, 'moderate') as {
      options: Array<{ text: string }>
    }
    expect(vote.options[0]!.text).toBe('clean')
    expect(vote.options[1]!.text).toBe('•••• take')

    const split = maskDerivedPublish({ scenarios: [{ id: 's0', text: 'damn it' }] }, 'strict') as { scenarios: Array<{ text: string }> }
    expect(split.scenarios[0]!.text).toBe('•••• it')
  })

  it('passes through when off or for a non-gallery shape', () => {
    const p = { options: [{ id: 'o0', text: 'shit' }] }
    expect(maskDerivedPublish(p, 'off')).toBe(p) // same ref, untouched
    expect(maskDerivedPublish({ foo: 1 }, 'strict')).toEqual({ foo: 1 })
  })
})
