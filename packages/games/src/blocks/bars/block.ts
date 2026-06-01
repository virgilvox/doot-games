/**
 * Bars block: the guided "make" half of Circuit Cypher (the robot rap battle).
 * The robot gives the player the FIRST line of each couplet; the player writes
 * the line that rhymes back. Two couplets => a four-line verse, alternating
 * robot line / player line, the way Mad Verse City builds a rap. The completed
 * verse is rendered to votable text via `toVoteText`, and a `vote` round (with
 * the robots performing) judges the hottest bars.
 *
 * Like Quip and Fill, it scores nothing itself and shows only a count on the big
 * screen; the verses are withheld until they're performed in the vote round.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import BarsHost from './BarsHost.vue'
import BarsPlayer from './BarsPlayer.vue'

export const coupletSchema = z.object({
  lead: z.string().min(1).describe('The line the robot raps to the player.'),
  rhymeWith: z
    .string()
    .default('')
    .describe('Optional word the player should try to rhyme their line with (a hint, not enforced).'),
})
export type Couplet = z.infer<typeof coupletSchema>

export const barsContentSchema = z.object({
  subject: z.string().default('').describe('Optional label shown on the big screen.'),
  prompt: z
    .string()
    .default('Drop your bars: finish each line so it rhymes.'),
  couplets: z
    .array(coupletSchema)
    .min(1)
    .describe('Each couplet is a robot lead line plus the line the player writes back. Two couplets make a four-line verse.'),
  variants: z
    .array(z.object({ couplets: z.array(coupletSchema).min(1) }))
    .optional()
    .describe(
      'Optional alternate per-player scaffolds. A custom game (Circuit Cypher) assigns a DIFFERENT one to each player so everyone writes a different rap; the base `couplets` is the fallback when unset. The bars block itself ignores this.',
    ),
  maxLength: z.number().int().positive().max(120).default(70).describe('Max characters per line the player writes.'),
  timer: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(90)
    .describe('Seconds to write the verse. Turn off for an untimed round.'),
})
export type BarsContent = z.infer<typeof barsContentSchema>
export interface BarsInput {
  lines: string[]
}

/** Assemble the full verse: robot lead, then the player's line, per couplet. */
export function renderVerse(content: BarsContent, input: BarsInput): string {
  const lines: string[] = []
  content.couplets.forEach((cp, i) => {
    lines.push(cp.lead)
    const mine = input.lines?.[i]?.trim()
    if (mine) lines.push(mine)
  })
  return lines.join('\n')
}

export const barsBlock = defineBlock<BarsContent, BarsInput>({
  kind: 'bars',
  name: 'Bars',
  contentSchema: barsContentSchema,
  defaultContent: () => ({
    subject: 'The Cypher',
    prompt: 'Drop your bars: finish each line so it rhymes.',
    couplets: [
      { lead: "I'm a top-tier bot and my circuits run hot,", rhymeWith: 'hot' },
      { lead: 'They plugged me in and I started to spit,', rhymeWith: 'spit' },
    ],
    maxLength: 70,
    timer: 90,
  }),
  defaultTimer: 90,
  timerOf: (c) => c.timer,
  emptyInput: (c) => ({ lines: (c.couplets ?? []).map(() => '') }),
  isComplete: (c, input) =>
    (c.couplets ?? []).length > 0 && (c.couplets ?? []).every((_, i) => (input.lines?.[i]?.trim().length ?? 0) > 0),
  PlayerInput: BarsPlayer,
  HostDisplay: BarsHost,
  toVoteText: (c, input) => renderVerse(c, input),
  aggregate: (ctx): ResultsFragment => ({
    stats: [{ label: 'Verses written', value: ctx.rounds.reduce((n, r) => n + ctx.inputsFor(r.index).size, 0) }],
  }),
})
