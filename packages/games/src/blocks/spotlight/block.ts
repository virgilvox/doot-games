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
 * kind has a family-friendly (mild) and a spicier (still party-appropriate) deck.
 * Nothing is withheld at this layer (what reaches the big screen is governed live by
 * the host's turn flow over the relay, not by answer redaction).
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { defineComponent, h } from 'vue'

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

// Never rendered (the game overrides components); a minimal stub keeps the block
// contract satisfied without an extra .vue file.
const Stub = defineComponent({ name: 'SpotlightStub', render: () => h('div') })

export const spotlightBlock = defineBlock<SpotlightContent, SpotlightInput>({
  kind: 'spotlight',
  name: 'Spotlight',
  contentSchema: spotlightContentSchema,
  defaultContent: () => ({ tier: 'mild', turns: 5, truthsMild: [], truthsSpicy: [], sharesMild: [], sharesSpicy: [] }),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: Stub,
  HostDisplay: Stub,
  // The game computes its own results (room.host.finish), like Circuit Cypher; no
  // aggregate needed. A tiny stat keeps it non-empty if ever scored generically.
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
