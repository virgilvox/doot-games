/**
 * One source of truth for a game type / block kind's visual identity: an accent
 * color (a theme token) and an icon name. Used by GameTypeIcon (create page,
 * editor round headers) and as the accent for covers. Keyed by both game-type
 * ids (guess/rate/...) and block kinds (quip/vote/...), which mostly overlap.
 */
export type IconName =
  | 'question'
  | 'star'
  | 'squiggle'
  | 'bars'
  | 'rank'
  | 'burst'
  | 'check'
  | 'grid'
  | 'text'
  | 'mic'
  | 'bell'

export interface GameVisual {
  /** A theme CSS custom property used as the icon background / accent. */
  color: string
  icon: IconName
}

const VISUALS: Record<string, GameVisual> = {
  guess: { color: 'var(--c4)', icon: 'question' },
  answer: { color: 'var(--c4)', icon: 'text' },
  'type-the-answer': { color: 'var(--c4)', icon: 'text' },
  rate: { color: 'var(--c3)', icon: 'star' },
  poll: { color: 'var(--c5)', icon: 'bars' },
  rank: { color: 'var(--c1)', icon: 'rank' },
  draw: { color: 'var(--c2)', icon: 'squiggle' },
  votebox: { color: 'var(--c3)', icon: 'star' },
  'quip-clash': { color: 'var(--primary)', icon: 'burst' },
  'mad-libs': { color: 'var(--c4)', icon: 'text' },
  'split-room': { color: 'var(--c1)', icon: 'rank' },
  'fib-finder': { color: 'var(--c2)', icon: 'check' },
  'sketch-spot': { color: 'var(--c2)', icon: 'squiggle' },
  'circuit-cypher': { color: 'var(--c5)', icon: 'mic' },
  'what-you-didnt-know': { color: 'var(--c1)', icon: 'bell' },
  backronym: { color: 'var(--c4)', icon: 'text' },
  'open-mic': { color: 'var(--primary)', icon: 'mic' },
  hivemind: { color: 'var(--c3)', icon: 'grid' },
  'most-likely': { color: 'var(--c1)', icon: 'check' },
  ballpark: { color: 'var(--c4)', icon: 'bars' },
  faker: { color: 'var(--c2)', icon: 'question' },
  'truth-or-share': { color: 'var(--c5)', icon: 'mic' },
  'quiz-or-die': { color: 'var(--c1)', icon: 'question' },
  'would-you-rather': { color: 'var(--c1)', icon: 'rank' },
  'tier-list': { color: 'var(--c3)', icon: 'star' },
  'over-under': { color: 'var(--c4)', icon: 'bars' },
  categories: { color: 'var(--c5)', icon: 'grid' },
  survey: { color: 'var(--c3)', icon: 'bars' },
  spectrum: { color: 'var(--c2)', icon: 'rank' },
  quip: { color: 'var(--primary)', icon: 'text' },
  vote: { color: 'var(--c5)', icon: 'check' },
  bars: { color: 'var(--c5)', icon: 'mic' },
  buzzer: { color: 'var(--c1)', icon: 'bell' },
  fill: { color: 'var(--c4)', icon: 'text' },
  split: { color: 'var(--c1)', icon: 'rank' },
  fibvote: { color: 'var(--c2)', icon: 'check' },
  drawvote: { color: 'var(--c2)', icon: 'squiggle' },
  mostlikely: { color: 'var(--c1)', icon: 'check' },
  accuse: { color: 'var(--c5)', icon: 'check' },
  spotlight: { color: 'var(--c5)', icon: 'mic' },
  cellar: { color: 'var(--c1)', icon: 'question' },
  collect: { color: 'var(--c3)', icon: 'grid' },
  custom: { color: 'var(--c1)', icon: 'grid' },
}

export function gameVisual(type: string): GameVisual {
  return VISUALS[type] ?? { color: 'var(--primary)', icon: 'grid' }
}

/** Distinct theme-token accents for team play, picked by a team's index in the
 *  lobby team list. Reads the same theme CSS custom properties as everything else,
 *  so team colours match the active theme. Wraps for more than five teams. */
const TEAM_COLORS = ['var(--c5)', 'var(--c3)', 'var(--c4)', 'var(--c1)', 'var(--c2)']
export function teamColor(index: number): string {
  const n = TEAM_COLORS.length
  return TEAM_COLORS[((index % n) + n) % n]!
}
