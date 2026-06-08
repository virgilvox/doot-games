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
export { default as Icon } from './components/Icon.vue'
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
export { default as StandingsPeek } from './components/StandingsPeek.vue'
export { default as Avatar } from './components/Avatar.vue'
export { default as GameCover } from './components/GameCover.vue'
export { default as GameTypeIcon } from './components/GameTypeIcon.vue'
export { default as SiteFooter } from './components/SiteFooter.vue'
export { type GameVisual, type IconName, gameVisual, teamColor } from './visuals'

// Image uploads (capability the app injects; ImageField falls back to URL)
export { type ImageUploader, type ImageUploadContext, IMAGE_UPLOAD } from './upload'
export { compressPhoto, PHOTO_BUDGET } from './photo'

// Audio (client-only robot TTS + MC announcer for the rap-battle performance)
export {
  type SpeakOptions,
  type AnnounceOptions,
  type VerseOptions,
  canSpeak,
  cancelSpeech,
  warmUpSpeech,
  primeSpeech,
  speakLines,
  announce,
  speakVerse,
} from './audio/speech'
export { playDing } from './audio/sfx'
// The procedural arena audio engine (beat + analyser + SFX; raw Web Audio, SSR-safe).
export { type ArenaAudio, type ArenaLevels, canPlayArenaAudio, createArenaAudio } from './audio/arena'
export { default as RobotRapper } from './components/RobotRapper.vue'
// The 3D rap-battle arena (lazy Three.js, client-only, SSR-safe).
export { default as RapBattleStage } from './components/RapBattleStage.vue'
// The 3D standup-comedy club (lazy Three.js, client-only, SSR-safe).
export { default as ComedyStage } from './components/ComedyStage.vue'

// Drawing (Pixi surface + SVG thumbnail + shared format)
export { default as DrawCanvas } from './components/DrawCanvas.vue'
export { default as DrawThumb } from './components/DrawThumb.vue'
export { type DrawStroke, type DrawValue, emptyDrawing, strokePath } from './draw'

// Editor (schema-driven authoring form)
export { default as SchemaForm } from './schema-form/SchemaForm.vue'
export { default as ImageField } from './components/ImageField.vue'
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
