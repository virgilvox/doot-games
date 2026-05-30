# @doot-games/themes

The design system as data: five theme token packs and CSS generation.

**Public surface**
- `themes`, `themeList`, `getTheme`, `isThemeId`, `DEFAULT_THEME_ID` — the packs
  (`doot`, `cutesie`, `cyber`, `professional`, `playful`), each `{ id, name,
  description, dark, tokens }`.
- `ThemeTokens` — the CSS custom-property contract every component reads.
- `allThemesCss()` / per-theme CSS generation (injected so there's no FOUC).
- `@doot-games/themes/base.css` — the base stylesheet.

Ported from `doot-mockup.html`, the canonical design source.
