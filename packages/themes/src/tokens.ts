/**
 * The Doot design-token model. A theme is a set of design tokens expressed as
 * CSS custom properties; it applies to the lobby, gameplay, and results
 * together so a game feels like one coherent thing from join to final score.
 *
 * Both DOM components and Pixi scenes read the same variables, so animated
 * results match the rest of the UI. See PRD section 11. The canonical visual
 * source is `doot-mockup.html`.
 */

export type ThemeId = 'doot' | 'cutesie' | 'cyber' | 'professional' | 'playful'

/** Every token a theme must define. Values are raw CSS (colors, lengths, shadows). */
export interface ThemeTokens {
  /** Page background and a slightly lifted variant. */
  bg: string
  bg2: string
  /** Card / panel surfaces. */
  surface: string
  surface2: string
  /** Text: primary, softened, and muted. */
  ink: string
  inkSoft: string
  mute: string
  /** Borders: strong and soft. */
  line: string
  lineSoft: string
  /** The accent used for primary actions, and readable text on top of it. */
  primary: string
  primaryInk: string
  /** Five-color accent palette for charts, motifs, avatars, and celebrations. */
  c1: string
  c2: string
  c3: string
  c4: string
  c5: string
  /** Corner radii and the border width. */
  radius: string
  radiusLg: string
  bd: string
  /** Drop shadows: standard and small. */
  shadow: string
  shadowSm: string
  /** Film-grain overlay opacity (0..1, as a string). */
  grain: string
  /** Glow blur for neon themes, or `none`. */
  glow: string
}

export interface Theme {
  id: ThemeId
  name: string
  description: string
  /** Whether the base is dark (drives `color-scheme` and UA form styling). */
  dark: boolean
  tokens: ThemeTokens
  /** Optional default music track played on the host surface only. */
  music?: string
}

/** Shared, theme-independent font tokens (set once on `:root`). */
export const FONT_TOKENS = {
  '--font-display': '"Baloo 2", system-ui, sans-serif',
  '--font-body': '"Figtree", system-ui, sans-serif',
  '--font-mono': '"DM Mono", ui-monospace, monospace',
} as const

/** Map each token to its CSS custom-property name (matches `doot-mockup.html`). */
export const TOKEN_TO_CSS_VAR: Record<keyof ThemeTokens, string> = {
  bg: '--bg',
  bg2: '--bg-2',
  surface: '--surface',
  surface2: '--surface-2',
  ink: '--ink',
  inkSoft: '--ink-soft',
  mute: '--mute',
  line: '--line',
  lineSoft: '--line-soft',
  primary: '--primary',
  primaryInk: '--primary-ink',
  c1: '--c1',
  c2: '--c2',
  c3: '--c3',
  c4: '--c4',
  c5: '--c5',
  radius: '--radius',
  radiusLg: '--radius-lg',
  bd: '--bd',
  shadow: '--shadow',
  shadowSm: '--shadow-sm',
  grain: '--grain',
  glow: '--glow',
}

/** The five accent token keys, for iterating palettes. */
export const ACCENT_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
