/**
 * The results payload and the standard widget shapes the results page renders.
 * A plugin's `score()` returns a `Results` object; its Results component
 * selects and arranges widgets from it. Scoring is pure and testable. See PRD
 * sections 8.3 and 12.
 */

/** Open payload — plugins may add their own keys beyond the standard ones. */
export interface Results {
  [key: string]: unknown
}

export interface LeaderboardEntry {
  id?: string
  name: string
  score: number
  /** Optional secondary text, e.g. "3 / 5 correct". */
  detail?: string
}

export interface AwardCard {
  label: string
  subject: string
  value?: string | number
}

export interface DistributionBar {
  label: string
  count: number
  /** Marks the correct option after reveal. */
  correct?: boolean
}

export interface Distribution {
  title?: string
  bars: DistributionBar[]
}

export interface StatItem {
  label: string
  value: string | number
}

/** A conventional results shape the built-in widgets understand out of the box. */
export interface StandardResults extends Results {
  headline?: string
  leaderboard?: LeaderboardEntry[]
  awards?: AwardCard[]
  distributions?: Distribution[]
  stats?: StatItem[]
}
