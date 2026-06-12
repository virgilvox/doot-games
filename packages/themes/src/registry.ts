/**
 * The theme registry. Themes are a registry like plugins: add a {@link Theme}
 * here to make it available across discovery, lobby, gameplay, and results.
 */
import { bubblegum, cutesie, cyber, doot, playful, professional } from './packs'
import type { Theme, ThemeId } from './tokens'

export const DEFAULT_THEME_ID: ThemeId = 'doot'

export const themes: Record<ThemeId, Theme> = {
  doot,
  cutesie,
  bubblegum,
  cyber,
  professional,
  playful,
}

/** Themes in display order (brand default first). */
export const themeList: Theme[] = [doot, cutesie, bubblegum, cyber, professional, playful]

export function isThemeId(id: string): id is ThemeId {
  return Object.prototype.hasOwnProperty.call(themes, id)
}

/** Resolve a theme by id, falling back to the brand default. */
export function getTheme(id: string | null | undefined): Theme {
  if (id && isThemeId(id)) return themes[id]
  return themes[DEFAULT_THEME_ID]
}
