import { describe, expect, it } from 'vitest'
import { voxPlan } from './vox'

/**
 * voxPlan is the pure half of the cast-safe robot vox: it paces syllable blips
 * and word starts for a line whose text is shown on screen (Circuit Cypher
 * karaoke, Open Mic bits). The audio half is feature-detected Web Audio; the
 * pacing math is what gameplay timing depends on, so it is unit-tested.
 */
describe('voxPlan', () => {
  it('is deterministic: the same text always yields the identical plan', () => {
    const a = voxPlan('My circuits run hot tonight!')
    const b = voxPlan('My circuits run hot tonight!')
    expect(a).toEqual(b)
  })

  it('plans one word start per word, in order', () => {
    const plan = voxPlan('the beat drops now')
    expect(plan.wordStarts).toHaveLength(4)
    for (let i = 1; i < plan.wordStarts.length; i++) {
      expect(plan.wordStarts[i]).toBeGreaterThan(plan.wordStarts[i - 1] ?? 0)
    }
    expect(plan.total).toBeGreaterThan(plan.wordStarts[3] ?? 0)
  })

  it('paces roughly at the requested words per second', () => {
    const words = 'one two three four five six seven eight nine ten eleven twelve'
    const plan = voxPlan(words, { wordsPerSec: 2.4 })
    const expected = 12 / 2.4
    expect(plan.total).toBeGreaterThan(expected * 0.5)
    expect(plan.total).toBeLessThan(expected * 1.7)
  })

  it('a faster pace finishes sooner', () => {
    const text = 'we came here to settle it on the mic tonight'
    expect(voxPlan(text, { wordsPerSec: 3.2 }).total).toBeLessThan(voxPlan(text, { wordsPerSec: 1.8 }).total)
  })

  it('gives every syllable blip a positive pitch and length', () => {
    const plan = voxPlan('Welcome to the Circuit Cypher, the robot rap battle!')
    expect(plan.events.length).toBeGreaterThan(8)
    for (const e of plan.events) {
      expect(e.f).toBeGreaterThan(0)
      expect(e.dur).toBeGreaterThan(0)
      expect(e.word).toBeGreaterThanOrEqual(0)
    }
  })

  it('rises at the end of a question (the spoken-cadence contour)', () => {
    const flat = voxPlan('are you ready to rumble.')
    const asked = voxPlan('are you ready to rumble?')
    const lastF = (p: ReturnType<typeof voxPlan>) => p.events[p.events.length - 1]?.f ?? 0
    expect(lastF(asked)).toBeGreaterThan(lastF(flat))
  })

  it('handles empty and tag-only text as silence', () => {
    expect(voxPlan('').events).toHaveLength(0)
    expect(voxPlan('   ').total).toBe(0)
    expect(voxPlan('<b></b>').events).toHaveLength(0)
  })
})
