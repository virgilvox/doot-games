import type { GameComposition } from '@doot-games/sdk'

/**
 * The in-memory handoff from the editor to the host. The editor stows the
 * authored composition here and navigates to `/host/<pluginId>`; HostRoom picks
 * it up if it matches. Nothing is persisted, a saved-games store (Postgres) is
 * a separate roadmap item, and per the architecture nothing about a live room
 * is written to a DB during play.
 */
export interface GameDraft {
  pluginId: string
  config: GameComposition
  themeId?: string
}

export function useGameDraft() {
  return useState<GameDraft | null>('doot-game-draft', () => null)
}
