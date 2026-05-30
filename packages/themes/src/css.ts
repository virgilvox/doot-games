/**
 * Turn theme tokens into CSS. The TypeScript token objects are the single
 * source of truth; `themes.css` is generated from `allThemesCss()`. The
 * `ThemeProvider` component can also apply `themeToCssVars` inline.
 */
import { themeList } from './registry'
import { FONT_TOKENS, TOKEN_TO_CSS_VAR, type Theme, type ThemeTokens } from './tokens'

/** `{ '--bg': '#FBF1E4', ... }`, suitable for an inline `style` binding. */
export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(TOKEN_TO_CSS_VAR) as Array<keyof ThemeTokens>) {
    out[TOKEN_TO_CSS_VAR[key]] = tokens[key]
  }
  return out
}

function declarationBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
}

/** A single `[data-theme="id"] { … }` rule. */
export function themeRuleCss(theme: Theme): string {
  return `[data-theme="${theme.id}"] {\n${declarationBlock(themeToCssVars(theme.tokens))}\n}`
}

/** The full stylesheet: `:root` font tokens plus every theme rule. */
export function allThemesCss(): string {
  const root = `:root {\n${declarationBlock({ ...FONT_TOKENS })}\n}`
  const dark = themeList
    .filter((t) => t.dark)
    .map((t) => `[data-theme="${t.id}"] { color-scheme: dark; }`)
    .join('\n')
  return [root, ...themeList.map(themeRuleCss), dark].join('\n\n')
}
