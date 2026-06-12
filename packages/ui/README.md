# @doot-games/ui

The shared, theme-aware Vue component library. Every component reads its colors,
fonts, and radii from the active theme's CSS custom properties.

**Public surface**
- Layout/system: `ThemeProvider`, `Stage`, `PhoneShell`, `ControlBar`, `DButton`,
  `DootLogo`, `QrCode`, `RoomTicket`.
- Inputs: `OptionGrid`, `RatingStrip`, `RankList`, `JoinForm`.
- Display/results: `VoteBars`, `Leaderboard`, `StatStrip`, `CountdownRing`,
  `RosterChips`, `Avatar`, `ConfettiBurst` (CSS).
- Catalog/discovery: `GameCover` (gradient cover + per-type motif), `GameTypeIcon`
  (colored type icon), `SiteFooter`, and the `gameVisual(type)` map (`visuals.ts`).
- Drawing (Pixi 8, lazy-loaded): `DrawCanvas`, `DrawThumb` (SVG), `DrawValue` (type).
- Editor: `SchemaForm` (auto-generates a form from a block's Zod `contentSchema`),
  `ImageField` (URL + upload), the `IMAGE_UPLOAD` provide/inject capability, and
  `describeSchema`/`blankValue` introspection.
- Controller kit (for controller-style games): `DPad`, `Thumbstick`,
  `ActionCluster`, `Buzzer`, `Bumper`, `PadButton`, `ControlSlider`, `Segmented`,
  `ToggleSwitch`, `ConnChip`, `PlayerHeader`, `ControllerPad`, `GamepadMapper`,
  plus the framework-free `controllers/` libraries (the logical-input contract,
  the `ControllerLayout` schema + `defineLayout`, and `createGamepadBridge`). The
  controls emit the logical-input contract so touch and a physical gamepad are
  interchangeable. See [`docs/controller-kit.md`](../../docs/controller-kit.md).
- `@doot-games/ui/styles.css` - the design-system stylesheet.

CSS-first animation; Pixi (via `vue3-pixi`/imperative fallback) only for canvas work.
