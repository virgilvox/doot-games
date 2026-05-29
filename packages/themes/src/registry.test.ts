import { describe, expect, it } from 'vitest'
import { allThemesCss, themeToCssVars } from './css'
import { DEFAULT_THEME_ID, getTheme, isThemeId, themeList, themes } from './registry'
import { TOKEN_TO_CSS_VAR, type ThemeTokens } from './tokens'

const TOKEN_KEYS = Object.keys(TOKEN_TO_CSS_VAR) as Array<keyof ThemeTokens>

describe('theme packs', () => {
  it('expose five themes with the brand default first', () => {
    expect(themeList).toHaveLength(5)
    expect(themeList[0]?.id).toBe(DEFAULT_THEME_ID)
    expect(DEFAULT_THEME_ID).toBe('doot')
  })

  it('every pack defines every token', () => {
    for (const theme of themeList) {
      for (const key of TOKEN_KEYS) {
        expect(theme.tokens[key], `${theme.id} missing ${key}`).toBeTruthy()
      }
    }
  })

  it('only cyber is dark', () => {
    expect(themes.cyber.dark).toBe(true)
    expect(themes.doot.dark).toBe(false)
    expect(themeList.filter((t) => t.dark).map((t) => t.id)).toEqual(['cyber'])
  })
})

describe('getTheme / isThemeId', () => {
  it('resolves known ids and falls back to the default', () => {
    expect(getTheme('cyber').id).toBe('cyber')
    expect(getTheme('nope').id).toBe(DEFAULT_THEME_ID)
    expect(getTheme(null).id).toBe(DEFAULT_THEME_ID)
  })

  it('narrows valid ids', () => {
    expect(isThemeId('playful')).toBe(true)
    expect(isThemeId('marble')).toBe(false)
  })
})

describe('css generation', () => {
  it('maps every token to its CSS variable', () => {
    const vars = themeToCssVars(themes.doot.tokens)
    expect(vars['--bg']).toBe('#FBF1E4')
    expect(vars['--primary']).toBe('#FF5A33')
    expect(Object.keys(vars)).toHaveLength(TOKEN_KEYS.length)
  })

  it('emits a rule per theme plus the font root', () => {
    const css = allThemesCss()
    expect(css).toContain(':root {')
    expect(css).toContain('--font-display')
    for (const theme of themeList) {
      expect(css).toContain(`[data-theme="${theme.id}"]`)
    }
    expect(css).toContain('color-scheme: dark')
  })
})
