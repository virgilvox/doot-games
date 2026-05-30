/**
 * Draw block, players sketch in response to a prompt; the host fills the big
 * screen with everyone's drawings as they come in. No right answer (no
 * withholding). Drawings travel as normalized vector strokes over the relay,  * small, replayable, and renderable at any size (see @doot-games/ui's draw
 * format). The Pixi surface lives in `DrawCanvas`; the host gallery uses SVG.
 */
import { type BlockResultsContext, type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import type { DrawValue } from '@doot-games/ui'
import DrawHost from './DrawHost.vue'
import DrawPlayer from './DrawPlayer.vue'

export const drawContentSchema = z.object({
  prompt: z.string().default('Draw the prompt!'),
  /** Optional reference image shown beside the prompt. */
  image: z.string().default(''),
  timer: z.number().int().nonnegative().nullable().default(60),
  /** Canvas aspect ratio (height / width). */
  aspect: z.number().positive().default(0.7),
})
export type DrawContent = z.infer<typeof drawContentSchema>
export type DrawInput = DrawValue

export const drawBlock = defineBlock<DrawContent, DrawInput>({
  kind: 'draw',
  name: 'Draw',
  contentSchema: drawContentSchema,
  defaultContent: () => ({ prompt: 'Draw the secret word: PINEAPPLE 🍍', image: '', timer: 60, aspect: 0.7 }),
  defaultTimer: 60,
  timerOf: (c) => c.timer,
  emptyInput: () => ({ strokes: [] }),
  isComplete: (_c, input) => Array.isArray(input?.strokes) && input.strokes.length > 0,
  PlayerInput: DrawPlayer,
  HostDisplay: DrawHost,
  aggregate: (ctx: BlockResultsContext<DrawContent, DrawInput>): ResultsFragment => {
    let drawings = 0
    let strokes = 0
    for (const { index } of ctx.rounds) {
      for (const input of ctx.inputsFor(index).values()) {
        const n = Array.isArray(input?.strokes) ? input.strokes.length : 0
        if (n > 0) {
          drawings++
          strokes += n
        }
      }
    }
    return {
      headline: 'Gallery time',
      stats: [
        { label: 'Draw rounds', value: ctx.rounds.length },
        { label: 'Drawings made', value: drawings },
        { label: 'Strokes drawn', value: strokes },
      ],
    }
  },
})
