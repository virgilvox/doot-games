/**
 * A server-safe catalog of the first-party game types — plain data only, with
 * NO imports of blocks or `.vue` views. The Nitro server (e.g. saved-games
 * validation) and any pure context can import this without pulling the Vue
 * component graph that `registry.ts` brings in. A test asserts it stays in sync
 * with the real registry (`catalog.test.ts`).
 */
export interface GameCatalogEntry {
  id: string
  name: string
  description: string
}

export const gameCatalog: GameCatalogEntry[] = [
  { id: 'guess', name: 'Guess', description: 'Multiple-choice rounds with a right answer, scored on a leaderboard.' },
  { id: 'rate', name: 'Rate', description: 'Score subjects on flexible scales — numbers, letter grades, or tiers.' },
  { id: 'poll', name: 'Poll', description: 'Opinion questions with no right answer; reveal the live distribution.' },
  { id: 'rank', name: 'Rank', description: 'Players order a set of items into one room-consensus ranking.' },
  { id: 'votebox', name: 'VoteBox', description: 'Guess then Rate — the original Doot party game.' },
]

const ids = new Set(gameCatalog.map((g) => g.id))

export function isKnownPlugin(id: string): boolean {
  return ids.has(id)
}
