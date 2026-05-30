/**
 * Fill block, a multi-blank "make" round (Mad Libs). Players fill a set of
 * labelled blanks (by part of speech) WITHOUT seeing the sentence, so the
 * completed story is a surprise. The blanks render into a template at vote time
 * via `toVoteText`, and a `vote` round judges the funniest filled story.
 *
 * Like Quip, this scores nothing itself and shows only a count on the big screen
 * (the words are withheld until the story is revealed in the vote round).
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import FillHost from './FillHost.vue'
import FillPlayer from './FillPlayer.vue'

export const fillBlankSchema = z.object({
  id: z.string().min(1),
  /** What the player is asked for, e.g. "An animal", "A verb ending in -ing". */
  label: z.string().default(''),
})
export type FillBlank = z.infer<typeof fillBlankSchema>

export const fillContentSchema = z.object({
  subject: z.string().default(''),
  prompt: z.string().default('Fill in the blanks (no peeking at the story!)'),
  /** Template with `{id}` placeholders matching blank ids. */
  template: z.string().default('The {noun} went to the {place}.'),
  blanks: z.array(fillBlankSchema).min(1),
  maxLength: z.number().int().positive().max(60).default(30),
  timer: z.number().int().nonnegative().nullable().default(75),
})
export type FillContent = z.infer<typeof fillContentSchema>
export interface FillInput {
  values: Record<string, string>
}

/** Render a template, substituting `{id}` with the player's word (or a blank). */
export function renderFilled(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, id: string) => values[id]?.trim() || '___')
}

export const fillBlock = defineBlock<FillContent, FillInput>({
  kind: 'fill',
  name: 'Fill',
  contentSchema: fillContentSchema,
  defaultContent: () => ({
    subject: '',
    prompt: 'Fill in the blanks (no peeking at the story!)',
    template: 'My {adjective} {animal} loves to {verb} every {noun}.',
    blanks: [
      { id: 'adjective', label: 'An adjective' },
      { id: 'animal', label: 'An animal' },
      { id: 'verb', label: 'A verb' },
      { id: 'noun', label: 'A noun' },
    ],
    maxLength: 30,
    timer: 75,
  }),
  defaultTimer: 75,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ values: {} }),
  isComplete: (c, input) => c.blanks.every((b) => (input.values[b.id]?.trim().length ?? 0) > 0),
  PlayerInput: FillPlayer,
  HostDisplay: FillHost,
  toVoteText: (c, input) => renderFilled(c.template, input.values),
  aggregate: (ctx): ResultsFragment => ({
    stats: [{ label: 'Stories written', value: ctx.rounds.reduce((n, r) => n + ctx.inputsFor(r.index).size, 0) }],
  }),
})
