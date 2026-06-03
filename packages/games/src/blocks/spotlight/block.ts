/**
 * Spotlight block, the parked round for the directed/spotlight pattern (Truth or
 * Share). Like Circuit Cypher's bars round, it gives the engine a single round to
 * sit on while the game drives all the per-turn spotlight state over custom relay
 * channels (`/x/turn`, `/x/pick`, `/x/response`, `/x/react`). The game overrides
 * `components`, so this block's own views are never mounted; they are minimal stubs
 * that satisfy the block contract.
 *
 * The content is the show config: the spice tier, the number of turns, and the
 * prompt decks. There are two kinds of prompt, since the target chooses how to play
 * each turn: TRUTH prompts (answer in words) and SHARE prompts (show a photo). Each
 * kind has a mild and a spicy deck.
 * Nothing is withheld at this layer (what reaches the big screen is governed live by
 * the host's turn flow over the relay, not by answer redaction).
 *
 * The PlayerInput/HostDisplay below are never mounted during a real game (the game
 * overrides `components`); they exist only so the schema editor's preview pane shows
 * a meaningful card describing the game instead of an empty box.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { type PropType, defineComponent, h } from 'vue'

export const spotlightContentSchema = z.object({
  tier: z.enum(['mild', 'spicy']).default('mild').describe('Default spice tier (the host can switch it in the lobby).'),
  turns: z.number().int().positive().max(40).default(5).describe('How many spotlight turns to play.'),
  truthsMild: z.array(z.string()).default([]).describe('Family-friendly truth questions.'),
  truthsSpicy: z.array(z.string()).default([]).describe('Spicier truth questions.'),
  sharesMild: z.array(z.string()).default([]).describe('Family-friendly photo-share prompts.'),
  sharesSpicy: z.array(z.string()).default([]).describe('Spicier photo-share prompts.'),
})
export type SpotlightContent = z.infer<typeof spotlightContentSchema>

/** No per-round input: the game collects picks/responses/reactions over custom
 *  channels, not as a normal round submission. */
export type SpotlightInput = Record<string, never>

const pill =
  'padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px;background:var(--surface);border:var(--bd) solid var(--line-soft);text-transform:capitalize'

// Editor-preview only (see the file header). The phone card describes the
// player's choice; the big-screen card describes the show.
const SpotlightPlayer = defineComponent({
  name: 'SpotlightPlayerPreview',
  props: { content: { type: Object as PropType<SpotlightContent>, default: () => ({}) } },
  setup() {
    return () =>
      h('div', { style: 'display:flex;flex-direction:column;gap:14px;text-align:center' }, [
        h('div', { style: 'font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)' }, 'Truth or Share'),
        h('p', { style: 'margin:0;font-size:15px;line-height:1.5;color:var(--ink-soft)' }, 'When the spotlight lands on you, pick Truth (answer out loud) or Share (a photo), then answer or pass. Passing is always free.'),
        h('div', { style: 'display:flex;gap:10px' }, [
          h('span', { style: 'flex:1;padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft)' }, 'Truth'),
          h('span', { style: 'flex:1;padding:14px;border-radius:12px;font-weight:800;background:var(--surface-2);border:var(--bd) solid var(--line-soft)' }, 'Share'),
        ]),
      ])
  },
})
const SpotlightHost = defineComponent({
  name: 'SpotlightHostPreview',
  props: { content: { type: Object as PropType<SpotlightContent>, default: () => ({}) } },
  setup(props) {
    return () => {
      const tier = props.content?.tier ?? 'mild'
      const turns = props.content?.turns ?? 5
      return h('div', { style: 'text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center' }, [
        h('div', { style: 'font-family:var(--font-display,inherit);font-size:24px;font-weight:800' }, 'Truth or Share'),
        h('p', { style: 'margin:0;font-size:15px;color:var(--ink-soft);max-width:36ch;line-height:1.5' }, 'The spotlight rotates each turn. One player is put on the spot, picks Truth or Share, answers or passes, and the room reacts.'),
        h('div', { style: 'display:flex;gap:10px' }, [
          h('span', { style: pill }, `${turns} turns`),
          h('span', { style: pill }, `${tier} tier`),
        ]),
        h('p', { style: 'margin:0;font-size:13px;color:var(--mute)' }, 'Host this game to run the live spotlight.'),
      ])
    }
  },
})

export const spotlightBlock = defineBlock<SpotlightContent, SpotlightInput>({
  kind: 'spotlight',
  name: 'Spotlight',
  contentSchema: spotlightContentSchema,
  defaultContent: () => ({ tier: 'mild', turns: 5, truthsMild: [], truthsSpicy: [], sharesMild: [], sharesSpicy: [] }),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: SpotlightPlayer,
  HostDisplay: SpotlightHost,
  // The game computes its own results (room.host.finish), like Circuit Cypher; no
  // aggregate needed. A tiny stat keeps it non-empty if ever scored generically.
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
