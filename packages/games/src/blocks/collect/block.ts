/**
 * Collect (Share) block: every player shares a photo (or a short text) in response to
 * a prompt, and the host fills the big screen with the gallery as shares arrive. No
 * right answer (no withholding). Photos are downscaled on-device and ride the relay as
 * ephemeral data URLs (never object storage) via the shared `compressPhoto` helper, the
 * same path Truth or Share uses.
 *
 * This is the reusable, composable share primitive (the generic answer to "where is the
 * share/spotlight mechanic" for Custom games). A later phase turns a collect round's
 * shares into a play-time deck so other rounds can reuse the collected media; see
 * docs/decks-roadmap.md §2.
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, promptText, z } from '@doot-games/sdk'
import CollectHost from './CollectHost.vue'
import CollectPlayer from './CollectPlayer.vue'

export const collectContentSchema = z.object({
  prompt: promptText('Share a photo that fits the prompt!'),
  /** What players share: a photo (default) or a short line of text. */
  kind: z.enum(['photo', 'text']).default('photo').describe('What players share: a photo or a short text.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(60)
    .describe('Seconds to share. Turn off for an untimed round.'),
})
export type CollectContent = z.infer<typeof collectContentSchema>
export interface CollectInput {
  /** A downscaled JPEG data URL (photo kind). */
  media?: string
  /** A short line of text (text kind). */
  text?: string
}

export const collectBlock = defineBlock<CollectContent, CollectInput>({
  kind: 'collect',
  name: 'Share',
  contentSchema: collectContentSchema,
  defaultContent: () => ({ prompt: 'Share a photo that fits the prompt!', kind: 'photo', timer: 60 }),
  defaultTimer: 60,
  timerOf: (c) => c.timer,
  emptyInput: () => ({}),
  isComplete: (c, input) => (c.kind === 'text' ? !!input?.text?.trim() : !!input?.media),
  PlayerInput: CollectPlayer,
  HostDisplay: CollectHost,
  aggregate: (ctx: BlockResultsContext<CollectContent, CollectInput>): ResultsFragment => {
    let shared = 0
    for (const { index } of ctx.rounds) {
      for (const input of ctx.inputsFor(index).values()) {
        if (input?.media || input?.text?.trim()) shared++
      }
    }
    return {
      headline: 'Show and tell',
      stats: [
        { label: 'Share rounds', value: ctx.rounds.length },
        { label: 'Things shared', value: shared },
      ],
    }
  },
})
