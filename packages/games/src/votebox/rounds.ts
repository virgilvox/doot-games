/**
 * Derive the round sequence from a VoteBox deck, and the answer-withholding
 * helpers. Guess slides become `multiple-choice` rounds; rate slides become
 * `rating` rounds. The host publishes the redacted config and reveals each
 * round's answer key only at reveal (the engine enforces the timing).
 */
import type { RoundSpec } from '@doot-games/sdk'
import type { VoteBoxConfig } from './config'

export function voteBoxRounds(config: VoteBoxConfig): RoundSpec[] {
  return config.slides.map((slide): RoundSpec => {
    if (slide.type === 'guess') {
      return {
        kind: 'multiple-choice',
        id: slide.id,
        subject: slide.subject,
        prompt: slide.prompt,
        image: slide.image || undefined,
        timer: slide.timer,
        options: slide.options.map((o) => ({ label: o.label, image: o.image })),
        correct: slide.correct,
      }
    }
    const categories = slide.categories.map((cid) => {
      const found = config.categories.find((c) => c.id === cid)
      return { id: cid, label: found?.label ?? cid }
    })
    return {
      kind: 'rating',
      id: slide.id,
      subject: slide.subject,
      prompt: slide.prompt,
      image: slide.image || undefined,
      timer: slide.timer,
      categories,
      scale: config.ratingScale,
    }
  })
}

/** Strip the correct index from every guess slide (publish-safe). */
export function voteBoxRedactConfig(config: VoteBoxConfig): VoteBoxConfig {
  return {
    ...config,
    slides: config.slides.map((s) => (s.type === 'guess' ? { ...s, correct: -1 } : s)),
  }
}

/** The answer key per round index, withheld until that round's reveal. */
export function voteBoxAnswerKeys(config: VoteBoxConfig): Record<number, unknown> {
  const keys: Record<number, unknown> = {}
  config.slides.forEach((slide, index) => {
    if (slide.type === 'guess') keys[index] = { correct: slide.correct }
  })
  return keys
}
