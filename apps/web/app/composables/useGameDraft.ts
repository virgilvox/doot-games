import type { GameComposition } from '@doot-games/sdk'

/**
 * The handoff from the editor to the host. The editor stows the authored
 * composition here and navigates to `/host/<pluginId>`; HostRoom picks it up if
 * it matches. It is mirrored to sessionStorage (client only) so reloading the
 * host tab keeps the draft; this is editor-handoff state, not live-room state,
 * so it doesn't violate the "nothing about a live room touches a DB" rule.
 */
export interface GameDraft {
  pluginId: string
  config: GameComposition
  themeId?: string
}

const KEY = 'doot-game-draft'
let wired = false

export function useGameDraft() {
  const state = useState<GameDraft | null>(KEY, () => null)
  if (import.meta.client && !wired) {
    wired = true
    if (state.value === null) {
      const raw = sessionStorage.getItem(KEY)
      if (raw) {
        try {
          state.value = JSON.parse(raw)
        } catch {
          sessionStorage.removeItem(KEY)
        }
      }
    }
    watch(
      state,
      (v) => {
        try {
          if (v) sessionStorage.setItem(KEY, JSON.stringify(v))
          else sessionStorage.removeItem(KEY)
        } catch {
          /* storage blocked (private mode / embedded frame); draft stays in-memory */
        }
      },
      { deep: true },
    )
  }
  return state
}
