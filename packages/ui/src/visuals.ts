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

export interface GameVisual {
  /** A theme CSS custom property used as the icon background / accent. */
  color: string
  icon: IconName
}

const VISUALS: Record<string, GameVisual> = {
  guess: { color: 'var(--c4)', icon: 'question' },
  rate: { color: 'var(--c3)', icon: 'star' },
  poll: { color: 'var(--c5)', icon: 'bars' },
  rank: { color: 'var(--c1)', icon: 'rank' },
  draw: { color: 'var(--c2)', icon: 'squiggle' },
  votebox: { color: 'var(--c3)', icon: 'star' },
  'quip-clash': { color: 'var(--primary)', icon: 'burst' },
  'mad-libs': { color: 'var(--c4)', icon: 'text' },
  'split-room': { color: 'var(--c1)', icon: 'rank' },
  'circuit-cypher': { color: 'var(--c5)', icon: 'mic' },
  quip: { color: 'var(--primary)', icon: 'text' },
  vote: { color: 'var(--c5)', icon: 'check' },
  bars: { color: 'var(--c5)', icon: 'mic' },
  fill: { color: 'var(--c4)', icon: 'text' },
  split: { color: 'var(--c1)', icon: 'rank' },
  custom: { color: 'var(--c1)', icon: 'grid' },
}

export function gameVisual(type: string): GameVisual {
  return VISUALS[type] ?? { color: 'var(--primary)', icon: 'grid' }
}
