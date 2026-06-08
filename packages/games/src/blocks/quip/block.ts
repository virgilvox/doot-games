/**
 * Quip block, a free-text submission ("write something"). The atomic "make" half
 * of the two-phase loop: players type an answer to a prompt; the answers are
 * collected privately (the engine only delivers a player their own input, the
 * host sees all) and become the options a `vote` block judges in the next round.
 *
 * This block scores nothing on its own and reveals nothing on the big screen
 * (showing the texts here would spoil the anonymized vote). It is meant to be
 * composed before a `vote` round; see the Quip Clash game.
 */
import { type ResultsFragment, defineBlock, promptText, z } from '@doot-games/sdk'
import QuipHost from './QuipHost.vue'
import QuipPlayer from './QuipPlayer.vue'

export const quipContentSchema = z.object({
  prompt: promptText('Finish the sentence...'),
  /** Optional image shown with the prompt (the generic renderer shows it on the
   *  big screen AND the phone). This is what turns a quip round into a "caption
   *  this image" / meme round; the typed answers still feed the next vote round. */
  image: z.string().default('').describe('Optional image to caption. Players write a caption for it.'),
  /** Optional placeholder text shown inside the empty answer box on the phone. */
  placeholder: z.string().default('').describe('Greyed-out hint text inside the empty answer box.'),
  maxLength: z.number().int().positive().max(280).default(80).describe('Max characters in an answer.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(60)
    .describe('Seconds to write an answer. Turn off for an untimed round.'),
  safetyAnswers: z
    .array(z.string())
    .default([])
    .describe('Canned "safety" answers. A player who runs out of time gets one (scored at half) so there is no dead air, no zeros.'),
})
export type QuipContent = z.infer<typeof quipContentSchema>
export interface QuipInput {
  text: string
}

export const quipBlock = defineBlock<QuipContent, QuipInput>({
  kind: 'quip',
  name: 'Quip',
  contentSchema: quipContentSchema,
  defaultContent: () => ({
    prompt: 'The worst thing to say on a first date is ___',
    image: '',
    placeholder: '',
    maxLength: 80,
    timer: 60,
    safetyAnswers: [],
  }),
  defaultTimer: 60,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ text: '' }),
  isComplete: (_c, input) => input.text.trim().length > 0,
  PlayerInput: QuipPlayer,
  HostDisplay: QuipHost,
  // No aggregate: the make round itself awards nothing; the vote round scores the
  // authors. A small stat keeps it from being invisible if hosted standalone.
  aggregate: (ctx): ResultsFragment => ({
    stats: [{ label: 'Answers written', value: ctx.rounds.reduce((n, r) => n + ctx.inputsFor(r.index).size, 0) }],
  }),
})
