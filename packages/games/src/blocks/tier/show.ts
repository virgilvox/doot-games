/**
 * The retained state the solo tier block's HostDisplay publishes on `/x/tiershow` for
 * every phone. The host owns the truth (votes flow through the standard round input);
 * this only tells a phone which item is open and whether voting is still live.
 */
export interface TierShow {
  /** 'voting' = take input (changeable); 'reveal' = the item is landing, locked. */
  phase: 'voting' | 'reveal'
  /** Current item index. */
  index: number
  /** Total items. */
  count: number
  /** Voting deadline (epoch ms), or null when untimed / paused. */
  deadline: number | null
  paused: boolean
}
