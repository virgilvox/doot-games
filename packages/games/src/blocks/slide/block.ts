/**
 * Info Slide, a display block with no player input: show a heading, body text, an
 * image, or any combination, full-bleed on the big screen and mirrored on phones.
 * Useful as a rules screen, an intro, an interstitial, or a credits slide between
 * rounds. The host advances it with a single button; it scores nothing.
 */
import { defineBlock, z } from '@doot-games/sdk'
import SlideView from './SlideView.vue'

export const slideContentSchema = z.object({
  heading: z.string().max(140).default('').describe('Optional heading shown large at the top.'),
  body: z
    .string()
    .max(1000)
    .default('')
    .describe('Optional text. Use it on its own, with a heading, or beside an image.'),
  image: z.string().max(2000).default('').describe('Optional picture. Shows large, on its own or beside the text.'),
})

export type SlideContent = z.infer<typeof slideContentSchema>
/** A slide takes no input. */
export type SlideInput = Record<string, never>

export const slideBlock = defineBlock<SlideContent, SlideInput>({
  kind: 'slide',
  name: 'Info Slide',
  display: true,
  contentSchema: slideContentSchema,
  defaultContent: () => ({
    heading: 'Your heading here',
    body: 'Add some text, an image, or both. This slide just shows information, there is nothing to answer.',
    image: '',
  }),
  defaultTimer: null,
  // A display block has no input; these satisfy the contract but the renderer never
  // collects a submission for it.
  emptyInput: () => ({}),
  PlayerInput: SlideView,
  HostDisplay: SlideView,
})
