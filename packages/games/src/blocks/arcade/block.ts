/**
 * Arcade block, the parked round for the Retro Arcade custom-flow game. Like
 * Bingo's bingo round, it gives the engine one round to sit on while the game
 * drives the whole show (load a ROM, boot the emulator, route every controller's
 * input) over the relay's custom `/x/` channels. The game overrides `components`,
 * so these views are never mounted in a real game; they are a minimal editor
 * preview. Nothing is withheld (no answer key), so there is no redaction.
 */
import { type ResultsFragment, defineBlock, z } from '@doot-games/sdk'
import { type PropType, defineComponent, h } from 'vue'

export const arcadeContentSchema = z.object({
  /** An optional default console key (the host can still pick or auto-detect). */
  core: z
    .string()
    .optional()
    .describe('Optional default console (auto-detected from the ROM otherwise).'),
})
export type ArcadeContent = z.infer<typeof arcadeContentSchema>

/** No per-round input: controller input rides custom channels, not round submissions. */
export type ArcadeInput = Record<string, never>

const ArcadePreview = defineComponent({
  name: 'ArcadePreview',
  props: { content: { type: Object as PropType<ArcadeContent>, default: () => ({}) } },
  setup() {
    return () =>
      h(
        'div',
        {
          style: 'display:flex;flex-direction:column;gap:12px;text-align:center;align-items:center',
        },
        [
          h(
            'div',
            {
              style:
                'font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)',
            },
            'Retro Arcade',
          ),
          h(
            'p',
            {
              style: 'margin:0;font-size:15px;line-height:1.5;color:var(--ink-soft);max-width:34ch',
            },
            'Drop in a ROM on the big screen. Everyone plays from their phone, or a gamepad plugged into the host, in the room or remote.',
          ),
          h(
            'div',
            {
              style:
                'width:min(240px,80%);aspect-ratio:4/3;border-radius:10px;background:#0c0a08;border:var(--bd) solid var(--line-soft);display:flex;align-items:center;justify-content:center;color:#6b5;font-family:var(--font-mono);font-size:12px',
            },
            'INSERT ROM',
          ),
        ],
      )
  },
})

export const arcadeBlock = defineBlock<ArcadeContent, ArcadeInput>({
  kind: 'arcade',
  name: 'Retro Arcade',
  contentSchema: arcadeContentSchema,
  defaultContent: () => ({}),
  defaultTimer: null,
  timerOf: () => null,
  emptyInput: () => ({}),
  isComplete: () => true,
  PlayerInput: ArcadePreview,
  HostDisplay: ArcadePreview,
  // The game runs entirely over custom channels and never scores a leaderboard,
  // so there is no aggregate to compute; a tiny stat keeps it non-empty.
  aggregate: (): ResultsFragment => ({ stats: [] }),
})
