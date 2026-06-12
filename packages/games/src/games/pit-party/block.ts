/**
 * The parked round for Pit Party. Like the arcade / bingo blocks, it gives the
 * engine one round to sit on while the custom Host/Player drive the entire race
 * over the relay's `/x/` channels. The game overrides `components`, so this view
 * is only ever the editor preview. No input, no scoring, no answer withholding.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { type PropType, defineComponent, h } from 'vue'

export const raceContentSchema = z.object({
  /** Optional default course id (the host can still pick in the lobby). */
  map: z.string().optional().describe('Optional starting course.'),
})
export type RaceContent = z.infer<typeof raceContentSchema>
export type RaceInput = Record<string, never>

const RacePreview = defineComponent({
  name: 'PitPartyPreview',
  props: { content: { type: Object as PropType<RaceContent>, default: () => ({}) } },
  setup() {
    return () =>
      h(
        'div',
        { style: 'display:flex;flex-direction:column;gap:12px;text-align:center;align-items:center' },
        [
          h(
            'div',
            {
              style:
                'font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)',
            },
            'Pit Party',
          ),
          h(
            'p',
            { style: 'margin:0;font-size:15px;line-height:1.5;color:var(--ink-soft);max-width:34ch' },
            'A split-screen kart Grand Prix on the big screen. Everyone joins on their phone, picks a driver and a kart, and races over the relay.',
          ),
          h(
            'div',
            {
              style:
                'width:min(240px,80%);aspect-ratio:16/9;border-radius:10px;background:#15131a;border:var(--bd) solid var(--line-soft);display:flex;align-items:center;justify-content:center;color:#ffd23f;font-family:var(--font-mono);font-size:12px',
            },
            'START YOUR ENGINES',
          ),
        ],
      )
  },
})

export const raceBlock = defineBlock<RaceContent, RaceInput>({
  kind: 'pit-race',
  name: 'Pit Party',
  contentSchema: raceContentSchema,
  defaultContent: () => ({}),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: RacePreview,
  HostDisplay: RacePreview,
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
