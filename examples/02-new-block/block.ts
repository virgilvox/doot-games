/**
 * Way 2: Write a new block (a new round kind).
 *
 * A block declares ONLY what's unique to its kind: a content schema (the editor
 * auto-generates a form from it), an empty input, a phone view, a big-screen view,
 * and a pure `aggregate` for results. Everything else (the room, relay, state
 * machine, timers, reconnect, answer-withholding) is the engine's job.
 *
 * This "Slider" block asks the room to rate a statement from 0–100; results show
 * the average. It's an opinion block (no right answer), so no redact/answerOf.
 *
 * The Player view is a controlled input: it receives `modelValue` and emits
 * `update:modelValue`. The generic renderer owns the "Lock it in" button and
 * gates it on `isComplete`. `aggregate` is pure and unit-testable.
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import SliderHost from './SliderHost.vue'
import SliderPlayer from './SliderPlayer.vue'

export const sliderContentSchema = z.object({
  prompt: z.string().default('How much do you agree?'),
  image: z.string().default(''),
  /** Labels for the two ends of the slider. */
  lowLabel: z.string().default('Nope'),
  highLabel: z.string().default('Totally'),
  timer: z.number().int().nonnegative().nullable().default(20),
})
export type SliderContent = z.infer<typeof sliderContentSchema>

export interface SliderInput {
  /** 0–100. */
  value: number
}

export const sliderBlock = defineBlock<SliderContent, SliderInput>({
  kind: 'slider',
  name: 'Slider',
  contentSchema: sliderContentSchema,
  defaultContent: () => ({
    prompt: 'How much do you agree?',
    image: '',
    lowLabel: 'Nope',
    highLabel: 'Totally',
    timer: 20,
  }),
  defaultTimer: 20,
  timerOf: (c) => c.timer,
  // Start at the midpoint so a no-op submit isn't biased to an extreme.
  emptyInput: () => ({ value: 50 }),
  // Always submittable (any position is a valid opinion).
  isComplete: () => true,
  PlayerInput: SliderPlayer,
  HostDisplay: SliderHost,

  // Pure: average each round's responses; award the "most agreed" statement.
  aggregate: (ctx: BlockResultsContext<SliderContent, SliderInput>): ResultsFragment => {
    const awards = ctx.rounds
      .map(({ index, content }) => {
        const inputs = ctx.inputsFor(index)
        let sum = 0
        let n = 0
        for (const i of inputs.values()) {
          if (typeof i?.value === 'number') {
            sum += i.value
            n++
          }
        }
        return { prompt: content.prompt, avg: n ? sum / n : 0, n }
      })
      .filter((r) => r.n > 0)
      .sort((a, b) => b.avg - a.avg)
      .map((r) => ({ label: 'Most agreed', subject: r.prompt, value: `${Math.round(r.avg)}%` }))
    return {
      headline: 'The results are in',
      awards: awards.slice(0, 3),
      stats: [{ label: 'Slider rounds', value: ctx.rounds.length }],
    }
  },
})
