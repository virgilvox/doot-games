/**
 * The retained show state the host publishes on `/x/show` for every phone to render.
 * The host owns the truth (votes, board, leaderboard); this is only what a player
 * needs to know which item to vote on and whether voting is open.
 */
export interface TierShow {
  /** 'voting' = take input; 'reveal' = the item is landing, hold; 'done' = finale. */
  phase: 'voting' | 'reveal' | 'done'
  /** 'one' = item-by-item (default); 'all' = place every item at once. */
  mode: 'one' | 'all'
  /** Current item index (item-by-item). */
  index: number
  /** Total items. */
  count: number
  /** Voting deadline (epoch ms), or null when untimed / paused. */
  deadline: number | null
  paused: boolean
}
