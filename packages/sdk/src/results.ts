/**
 * The results payload and the standard widget shapes the results page renders.
 * A plugin's `score()` returns a `Results` object; its Results component
 * selects and arranges widgets from it. Scoring is pure and testable. See PRD
 * sections 8.3 and 12.
 */

/** Open payload, plugins may add their own keys beyond the standard ones. */
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
  /** Optional picture for the award (e.g. the top-rated thing's image). */
  image?: string
}

export interface DistributionBar {
  label: string
  /** The bar's value (for a vote distribution, the number of votes). */
  count: number
  /** Marks the correct option after reveal. */
  correct?: boolean
  /** Fill ceiling; defaults to the sum of counts in the distribution. Set this
   *  when `count` is not a vote tally (e.g. a ranking weight against item count). */
  max?: number
  /** Shown instead of the numeric value (e.g. a rank "#1" or a tier "B"). */
  display?: string
  /** Caption under the value; defaults to "N votes". */
  note?: string
  /** Optional picture for this entry (a rank/tier item's own image). Rendered as a
   *  thumbnail in the bar list, and full size when this entry leads a podium. */
  image?: string
  /** The place to show on a podium, e.g. "#1". Entries the room placed LEVEL share
   *  one ("#1", "#1", "#3"), so a dead heat never reads as an order nobody chose.
   *  Defaults to the row's position. */
  place?: string
}

export interface Distribution {
  title?: string
  bars: DistributionBar[]
  /** How to render the bars. `bars` (the default) is the value-bar chart; `podium`
   *  leads with the first bar as a large winner card (its picture, if any) and lists
   *  the rest of the order below. Blocks whose bars ARE an ordering (rank) ask for
   *  `podium` so the room sees the whole result with the winner on top. */
  layout?: 'bars' | 'podium'
}

export interface StatItem {
  label: string
  value: string | number
}

/** One team's rolled-up total, when a game is played in teams. Built by the
 *  generic renderer from the per-player leaderboard + each player's team; blocks
 *  never produce this. */
export interface TeamScore {
  team: string
  score: number
  /** How many players are on the team. */
  members: number
}

/** A conventional results shape the built-in widgets understand out of the box. */
export interface StandardResults extends Results {
  headline?: string
  leaderboard?: LeaderboardEntry[]
  /** Team totals, present only when the game was played in teams. Rendered as a
   *  team board above the per-player leaderboard. */
  teamLeaderboard?: TeamScore[]
  awards?: AwardCard[]
  distributions?: Distribution[]
  stats?: StatItem[]
  /** Extra payload a game's custom Results view understands (e.g. a chain game's
   *  unspooled threads). The generic widgets ignore it. */
  recap?: unknown
}
