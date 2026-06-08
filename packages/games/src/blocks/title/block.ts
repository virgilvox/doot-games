/**
 * Title Card, a display block with no player input: a big centered title with an
 * optional subtitle. The section-divider / "and now…" beat at the start of a game
 * or between rounds. The host advances it with a single button; it scores nothing.
 */
import { defineBlock, z } from '@doot-games/sdk'
import TitleView from './TitleView.vue'

export const titleContentSchema = z.object({
  title: z.string().max(120).default('Welcome').describe('The big title shown center-screen.'),
  subtitle: z.string().max(160).default('').describe('Optional smaller line above the title (a kicker).'),
})

export type TitleContent = z.infer<typeof titleContentSchema>
/** A title card takes no input. */
export type TitleInput = Record<string, never>

export const titleBlock = defineBlock<TitleContent, TitleInput>({
  kind: 'title',
  name: 'Title Card',
  display: true,
  contentSchema: titleContentSchema,
  defaultContent: () => ({ title: 'Welcome to the show', subtitle: 'Get ready to play' }),
  defaultTimer: null,
  emptyInput: () => ({}),
  PlayerInput: TitleView,
  HostDisplay: TitleView,
})
