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
export { default as AudioClip } from './components/AudioClip.vue'
export { default as SpectrumDial } from './components/SpectrumDial.vue'
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
  hasVoices,
  cancelSpeech,
  warmUpSpeech,
  primeSpeech,
  speakLines,
  announce,
  speakVerse,
  speechLooksSilent,
} from './audio/speech'
// The cast-safe robot vox (Web Audio; survives tab casting, unlike speechSynthesis).
export { type VoxOptions, type VoxPlanned, canPlayVox, speakVox, voxPlan } from './audio/vox'
export { playDing } from './audio/sfx'
// The flagship cover map (one source of truth for cards + og:image).
export { FLAGSHIP_COVERS } from './covers'
// Stage SFX for the generic big-screen host (join pop, lock click, ticks, sting, fanfare).
export { type StageSfx, createStageSfx } from './audio/stage'
// The procedural arena audio engine (beat + analyser + SFX; raw Web Audio, SSR-safe).
export { type ArenaAudio, type ArenaLevels, canPlayArenaAudio, createArenaAudio } from './audio/arena'
// A reusable sample + music player (decode-once, one-shots + looping; cast-safe).
export { type Sampler, createSampler } from './audio/sampler'
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

// Controller kit, theme-aware touch controls. The momentary/analog controls emit
// the logical-input contract (`@input` / `@axis`); the settings widgets use v-model.
export { default as PadButton } from './components/controls/PadButton.vue'
export { default as DPad } from './components/controls/DPad.vue'
export { default as Thumbstick } from './components/controls/Thumbstick.vue'
export { default as SteeringWheel } from './components/controls/SteeringWheel.vue'
export { default as ActionCluster } from './components/controls/ActionCluster.vue'
export { default as Buzzer } from './components/controls/Buzzer.vue'
export { default as Bumper } from './components/controls/Bumper.vue'
export { default as ControlSlider } from './components/controls/ControlSlider.vue'
export { default as Segmented } from './components/controls/Segmented.vue'
export { default as ToggleSwitch } from './components/controls/ToggleSwitch.vue'
export { default as ConnChip } from './components/controls/ConnChip.vue'
export { default as PlayerHeader } from './components/controls/PlayerHeader.vue'
export { default as ControllerPad } from './components/controls/ControllerPad.vue'
export { default as GamepadMapper } from './components/controls/GamepadMapper.vue'
export { usePointerButton } from './components/controls/usePointerButton'

// Controller libraries (framework-free): the logical-input contract, the
// target-agnostic controller-layout schema, the gamepad bridge, and pure math.
export type {
  LogicalButtonId,
  AxisSide,
  InputSource,
  DigitalInputEvent,
  AnalogInputEvent,
} from './controllers/logical-input'
export {
  type ControllerLayout,
  type LayoutCluster,
  type LayoutButton,
  type ClusterHue,
  type ClusterLayout,
  defineLayout,
  registerLayout,
  getLayout,
  listLayouts,
  HUE_BY_NAME,
} from './controllers/layout'
export {
  nesLayout,
  snesLayout,
  n64Layout,
  gameboyLayout,
  genesisLayout,
  psxLayout,
  BUILTIN_LAYOUTS,
} from './controllers/layout.presets'
export {
  type GamepadMapping,
  type GamepadBridge,
  type GamepadBridgeOptions,
  type GamepadEnv,
  createGamepadBridge,
  STANDARD_GAMEPAD_MAPPING,
} from './controllers/gamepad'
export {
  type DpadDirections,
  type GamepadSnapshot,
  dpadDirections,
  clampStick,
  deadzone,
  stickSample,
  sliderPct,
  sliderValueFromPointer,
  foldGamepad,
} from './controllers/math'
