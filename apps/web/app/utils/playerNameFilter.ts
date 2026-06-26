import { maskText } from '@doot-games/games'

/**
 * The display-name policy for player names shown on the shared big screen + rosters.
 * Player names are public (projected to the whole room), so we always mask strong
 * profanity/slurs in them at the 'moderate' tier (independent of a game's gallery
 * content-filter setting). Passed to `useDootRoom({ nameFilter })`; the engine applies
 * it to roster/results/standings names while keeping the raw name for identity, so
 * reconnect-by-name is unaffected. Reuses the gallery content filter (obscenity).
 */
export const playerNameFilter = (name: string): string => maskText(name, 'moderate')
