import { describe, expect, it } from 'vitest'
import type { DoodleStepView } from '../../blocks/doodle/block'
import { flattenSlides, livingThreads, slideHoldMs, stepVerb } from './show'

const draw = { strokes: [{ color: '#000', size: 0.01, points: [0, 0, 1, 1] }] }
function chain(n: number, withDrawings = true): DoodleStepView[] {
  return Array.from({ length: n }, (_, i) => ({
    step: i + 1,
    name: `P${i}`,
    mode: (i % 2 === 1 ? 'draw' : 'describe') as 'draw' | 'describe',
    text: i % 2 === 1 ? '' : `text ${i}`,
    drawing: i % 2 === 1 && withDrawings ? draw : undefined,
  }))
}

describe('doodle show logic', () => {
  it('flattens chains into ordered slides with chain/step coordinates', () => {
    const slides = flattenSlides([chain(3), chain(3)])
    expect(slides).toHaveLength(6)
    expect(slides[0]).toMatchObject({ chainIndex: 0, stepIndex: 0, chainLen: 3, chainCount: 2 })
    expect(slides[3]).toMatchObject({ chainIndex: 1, stepIndex: 0 })
    expect(slides[5]).toMatchObject({ chainIndex: 1, stepIndex: 2 })
  })

  it('drops empty chains from the count and the slides', () => {
    const empty: DoodleStepView[] = [{ step: 1, name: 'x', mode: 'describe', text: '', drawing: undefined }]
    expect(livingThreads([chain(3), empty])).toHaveLength(1)
    expect(flattenSlides([chain(3), empty]).every((s) => s.chainCount === 1)).toBe(true)
  })

  it('holds drawings longer than text', () => {
    const slides = flattenSlides([chain(3)])
    const drawSlide = slides.find((s) => s.step.mode === 'draw' && s.step.drawing)
    const textSlide = slides.find((s) => s.step.mode === 'describe')
    expect(slideHoldMs(drawSlide as never)).toBeGreaterThan(slideHoldMs(textSlide as never))
  })

  it('labels the first step as the kickoff and the rest by mode', () => {
    const slides = flattenSlides([chain(3)])
    expect(stepVerb(slides[0] as never)).toMatch(/kicked/)
    expect(stepVerb(slides[1] as never)).toBe('drew')
    expect(stepVerb(slides[2] as never)).toBe('guessed')
  })
})
