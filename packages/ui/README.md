# @doot-games/ui

The shared, theme-aware Vue component library. Every component reads its colors,
fonts, and radii from the active theme's CSS custom properties.

**Public surface**
- Layout/system: `ThemeProvider`, `Stage`, `PhoneShell`, `ControlBar`, `DButton`,
  `DootLogo`, `QrCode`, `RoomTicket`.
- Inputs: `OptionGrid`, `RatingStrip`, `RankList`, `JoinForm`.
- Display/results: `VoteBars`, `Leaderboard`, `StatStrip`, `CountdownRing`,
  `RosterChips`, `Avatar`, `ConfettiBurst` (CSS).
- Drawing (Pixi 8, lazy-loaded): `DrawCanvas`, `DrawThumb` (SVG), `DrawValue`.
- Editor: `SchemaForm` (auto-generates a form from a block's Zod `contentSchema`),
  `ImageField` (URL + upload), the `IMAGE_UPLOAD` provide/inject capability, and
  `describeSchema`/`blankValue` introspection.
- `@doot-games/ui/styles.css` — the design-system stylesheet.

CSS-first animation; Pixi (via `vue3-pixi`/imperative fallback) only for canvas work.
