/**
 * Bingo block, the parked round for the Bingo custom-flow game. Like Circuit Cypher's
 * bars round or Truth or Share's spotlight, it gives the engine a single round to sit
 * on while the game drives the whole live show (the deal, the calls, the claims) over
 * custom relay channels (`/x/setup`, `/x/calls`, `/x/claim`, `/x/result`). The game
 * overrides `components`, so this block's own views are never mounted in a real game;
 * they are minimal stubs that satisfy the block contract and give the editor preview a
 * meaningful card.
 *
 * The content is the show config: the card size and the call packs (a host picks a pack
 * and a size in the lobby). Nothing is withheld at this layer: a bingo card is public by
 * nature (the fun is the race), it is dealt deterministically per player from the room
 * seed, and it never travels the relay, so there is no answer key to redact.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { type PropType, defineComponent, h } from 'vue'

const packSchema = z.object({
  key: z.string(),
  name: z.string(),
  blurb: z.string().default(''),
  items: z.array(z.string()).default([]),
})

export const bingoContentSchema = z.object({
  size: z.number().int().min(3).max(5).default(5).describe('Card size (3, 4, or 5 per side).'),
  packs: z.array(packSchema).default([]).describe('The call packs the host can choose in the lobby.'),
})
export type BingoContent = z.infer<typeof bingoContentSchema>

/** No per-round input: the game collects claims over a custom channel, not as a normal
 *  round submission. */
export type BingoInput = Record<string, never>

const cell = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:8px;font-weight:800;font-size:12px;background:var(--surface-2);border:var(--bd) solid var(--line-soft)'

const BingoPreview = defineComponent({
  name: 'BingoPreview',
  props: { content: { type: Object as PropType<BingoContent>, default: () => ({}) } },
  setup(props) {
    return () => {
      const size = props.content?.size ?? 5
      return h('div', { style: 'display:flex;flex-direction:column;gap:14px;text-align:center;align-items:center' }, [
        h('div', { style: 'font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)' }, 'Bingo'),
        h('p', { style: 'margin:0;font-size:15px;line-height:1.5;color:var(--ink-soft);max-width:34ch' }, `Everyone gets a unique ${size} by ${size} card. The host calls items; mark yours, and shout bingo when you complete a line.`),
        h(
          'div',
          { style: `display:grid;grid-template-columns:repeat(${size},1fr);gap:6px;width:min(220px,80%)` },
          Array.from({ length: size * size }, (_, i) => h('span', { style: cell }, i === Math.floor((size * size) / 2) && size % 2 === 1 ? 'FREE' : '')),
        ),
      ])
    }
  },
})

export const bingoBlock = defineBlock<BingoContent, BingoInput>({
  kind: 'bingo',
  name: 'Bingo',
  contentSchema: bingoContentSchema,
  defaultContent: () => ({ size: 5, packs: [] }),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: BingoPreview,
  HostDisplay: BingoPreview,
  // The game computes its own results (room.host.finish), like Circuit Cypher; no
  // aggregate needed. A tiny stat keeps it non-empty if ever scored generically.
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
