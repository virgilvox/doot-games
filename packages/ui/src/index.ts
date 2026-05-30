/**
 * @doot-games/ui, the shared, theme-aware component library.
 *
 * Every component reads its colors, fonts, radii, and shadows from the CSS
 * custom properties the active theme sets, so the same component looks correct
 * in any theme. Most motion is plain CSS; Pixi (via vue3-pixi) is reserved for
 * canvas-heavy widgets like ConfettiBurst and DrawCanvas. See PRD section 9.
 */

// System
export { default as ThemeProvider } from './components/ThemeProvider.vue'
export { default as DootLogo } from './components/DootLogo.vue'
export { default as DButton } from './components/DButton.vue'
export { default as QrCode } from './components/QrCode.vue'
export { default as RoomTicket } from './components/RoomTicket.vue'

// Layout
export { default as Stage } from './components/Stage.vue'
export { default as PhoneShell } from './components/PhoneShell.vue'
export { default as ControlBar } from './components/ControlBar.vue'

// Inputs
export { default as OptionGrid } from './components/OptionGrid.vue'
export { default as RatingStrip } from './components/RatingStrip.vue'
export { default as RankList } from './components/RankList.vue'
export { default as JoinForm } from './components/JoinForm.vue'

// Display
export { default as CountdownRing } from './components/CountdownRing.vue'
export { default as VoteBars } from './components/VoteBars.vue'
export { default as RosterChips } from './components/RosterChips.vue'
export { default as Avatar } from './components/Avatar.vue'

// Image uploads (capability the app injects; ImageField falls back to URL)
export { type ImageUploader, type ImageUploadContext, IMAGE_UPLOAD } from './upload'

// Drawing (Pixi surface + SVG thumbnail + shared format)
export { default as DrawCanvas } from './components/DrawCanvas.vue'
export { default as DrawThumb } from './components/DrawThumb.vue'
export { type DrawStroke, type DrawValue, emptyDrawing, strokePath } from './draw'

// Editor (schema-driven authoring form)
export { default as SchemaForm } from './schema-form/SchemaForm.vue'
export {
  type FieldNode,
  type FieldEntry,
  type UnionVariant,
  blankValue,
  describeSchema,
  humanizeName,
} from './schema-form/introspect'

// Results
export { default as Leaderboard } from './components/Leaderboard.vue'
export { default as StatStrip } from './components/StatStrip.vue'
export { default as ConfettiBurst } from './components/ConfettiBurst.vue'
