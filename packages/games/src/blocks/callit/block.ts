/**
 * Call It block, the parked round for the Call It custom-flow game. Like Truth or
 * Share's spotlight, it gives the engine a single round to sit on while the game drives
 * every live prediction over custom relay channels (`/x/call`, `/x/pick`, `/x/board`).
 * The game overrides `components`, so this block's own views are never mounted in a real
 * game; they are minimal stubs for the editor preview.
 *
 * The content carries the starter helpers (example prompts + ready-made option sets). The
 * actual outcome of each call is unknown until it happens in the real world, so there is
 * nothing to withhold and no answer key in the config.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { type PropType, defineComponent, h } from 'vue'

export const callitContentSchema = z.object({
  examples: z.array(z.string()).default([]).describe('Example prompts to seed the host.'),
  optionSets: z
    .array(z.object({ name: z.string(), options: z.array(z.string()) }))
    .default([])
    .describe('Ready-made option sets the host can drop in.'),
})
export type CallitContent = z.infer<typeof callitContentSchema>

/** No per-round input: picks arrive over a custom channel, not as a round submission. */
export type CallitInput = Record<string, never>

const pill = 'padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft);flex:1;text-align:center'

const CallitPreview = defineComponent({
  name: 'CallitPreview',
  props: { content: { type: Object as PropType<CallitContent>, default: () => ({}) } },
  setup() {
    return () =>
      h('div', { style: 'display:flex;flex-direction:column;gap:14px;text-align:center;align-items:center' }, [
        h('div', { style: 'font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)' }, 'Call It'),
        h('p', { style: 'margin:0;font-size:15px;line-height:1.5;color:var(--ink-soft);max-width:34ch' }, 'The host poses a live prediction; everyone locks a pick. When it actually happens, the host taps the real outcome and the room scores. Run as many calls as you like.'),
        h('div', { style: 'display:flex;gap:10px;width:min(280px,90%)' }, [h('span', { style: pill }, 'Yes'), h('span', { style: pill }, 'No')]),
      ])
  },
})

export const callitBlock = defineBlock<CallitContent, CallitInput>({
  kind: 'callit',
  name: 'Call It',
  contentSchema: callitContentSchema,
  defaultContent: () => ({ examples: [], optionSets: [] }),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: CallitPreview,
  HostDisplay: CallitPreview,
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
