/**
 * VoteBox config: a deck of alternating guess and rate slides, plus the shared
 * rating categories and scale. This is the durable game definition the editor
 * produces and validates. VoteBox is the reference plugin (PRD section 20).
 */
import { z } from '@doot-games/sdk'

export const ratingCategorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
})

export const guessOptionSchema = z.object({
  label: z.string().default(''),
  image: z.string().optional(),
})

export const guessSlideSchema = z.object({
  id: z.string().min(1),
  type: z.literal('guess'),
  subject: z.string().default(''),
  prompt: z.string().default('Who is this?'),
  image: z.string().default(''),
  timer: z.number().int().nonnegative().nullable().default(20),
  options: z.array(guessOptionSchema).min(2),
  /** Index of the correct option. Stripped to -1 in the published config. */
  correct: z.number().int().default(0),
})

export const rateSlideSchema = z.object({
  id: z.string().min(1),
  type: z.literal('rate'),
  subject: z.string().default(''),
  prompt: z.string().default('Rate this'),
  image: z.string().default(''),
  timer: z.number().int().nonnegative().nullable().default(null),
  /** Category ids (must exist in the deck's `categories`). */
  categories: z.array(z.string()).default([]),
})

export const slideSchema = z.discriminatedUnion('type', [guessSlideSchema, rateSlideSchema])

export const voteBoxConfigSchema = z.object({
  title: z.string().default('Character Night'),
  ratingScale: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
      step: z.number().int().positive(),
    })
    .default({ min: 1, max: 10, step: 1 }),
  categories: z.array(ratingCategorySchema).default([]),
  slides: z.array(slideSchema).default([]),
})

export type VoteBoxConfig = z.infer<typeof voteBoxConfigSchema>
export type GuessSlide = z.infer<typeof guessSlideSchema>
export type RateSlide = z.infer<typeof rateSlideSchema>
export type VoteBoxSlide = z.infer<typeof slideSchema>

/** A player's submission. Guess rounds carry a choice; rate rounds carry ratings. */
export interface GuessInput {
  choice: number | null
}
export interface RateInput {
  ratings: Record<string, number>
}
export type VoteBoxInput = GuessInput | RateInput

export function isGuessInput(input: unknown): input is GuessInput {
  return typeof input === 'object' && input !== null && 'choice' in input
}
export function isRateInput(input: unknown): input is RateInput {
  return typeof input === 'object' && input !== null && 'ratings' in input
}

/** The seed content a creator starts from: three characters, guess then rate. */
export function defaultVoteBoxConfig(): VoteBoxConfig {
  const categories = [
    { id: 'art', label: 'Art Style' },
    { id: 'pose', label: 'Pose' },
    { id: 'pref', label: 'Personal Preference' },
  ]
  const slides: VoteBoxSlide[] = []
  for (const [i, subject] of ['Character One', 'Character Two', 'Character Three'].entries()) {
    slides.push({
      id: `guess-${i}`,
      type: 'guess',
      subject,
      prompt: 'Who is this?',
      image: '',
      timer: 20,
      options: [
        { label: 'Option A' },
        { label: 'Option B' },
        { label: 'Option C' },
        { label: 'Option D' },
      ],
      correct: 0,
    })
    slides.push({
      id: `rate-${i}`,
      type: 'rate',
      subject,
      prompt: `Rate ${subject}`,
      image: '',
      timer: null,
      categories: ['art', 'pose', 'pref'],
    })
  }
  return { title: 'Character Night', ratingScale: { min: 1, max: 10, step: 1 }, categories, slides }
}
