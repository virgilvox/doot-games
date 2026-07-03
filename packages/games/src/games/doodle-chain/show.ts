/**
 * Pure slideshow logic for the Doodle Chain results (the Gartic-Phone-style reveal).
 * Kept out of the component so it is unit-testable: flattening the chains into an
 * ordered list of slides, per-slide auto-advance timing, and step labels.
 */
import type { DoodleStepView } from '../../blocks/doodle/block'

export interface DoodleSlide {
  /** Which chain (0-based) this slide belongs to. */
  chainIndex: number
  /** Position within the chain (0-based). */
  stepIndex: number
  /** Number of steps in this slide's chain. */
  chainLen: number
  /** Total number of chains being shown. */
  chainCount: number
  step: DoodleStepView
}

/** Drop chains nobody contributed to, so the count matches what renders. */
export function livingThreads(threads: DoodleStepView[][]): DoodleStepView[][] {
  return threads.filter((t) => t.some((s) => s.text || s.drawing))
}

/** Flatten chains into one ordered list of slides for the slideshow. */
export function flattenSlides(threads: DoodleStepView[][]): DoodleSlide[] {
  const chains = livingThreads(threads)
  const chainCount = chains.length
  const slides: DoodleSlide[] = []
  chains.forEach((thread, chainIndex) => {
    thread.forEach((step, stepIndex) => {
      slides.push({ chainIndex, stepIndex, chainLen: thread.length, chainCount, step })
    })
  })
  return slides
}

/** Auto-hold duration: drawings get longer than text so the room can take them in. */
export function slideHoldMs(slide: DoodleSlide): number {
  return slide.step.mode === 'draw' && slide.step.drawing ? 4200 : 2600
}

/** A short label for what happened at this step of the chain. */
export function stepVerb(slide: DoodleSlide): string {
  if (slide.stepIndex === 0) return 'kicked it off'
  return slide.step.mode === 'draw' ? 'drew' : 'guessed'
}
