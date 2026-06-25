<script setup lang="ts">
/**
 * Retro Arcade phone controller. A full-screen gamepad built the way the Doot
 * emulator prototype does it: a `100dvh` flex column with a thin status strip on
 * top and the kit's ControllerPad filling the rest, controls self-sizing with
 * `vmin` clamps (no measuring, no transforms). It reads the console from `/x/meta`
 * and this phone's seat from `/x/assign/<pid>`, and forwards input to the host over
 * `/x/in/<pid>` (a logical button) and `/x/axis/<pid>` (a stick); touch and a
 * plugged-in gamepad emit the same events.
 *
 * Landscape is the full pad with the optional watch-stream tucked INSIDE the pad's
 * centre column (above the system buttons, so it never covers a button). Portrait
 * anchors the thumb clusters to the bottom and floats the watch-stream across the
 * empty top. A size control scales every control via `--control-scale`.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import {
  type AnalogInputEvent,
  Avatar,
  ConnChip,
  ControllerPad,
  type DigitalInputEvent,
  type GamepadBridge,
  GamepadMapper,
  type GamepadMapping,
  Segmented,
  ToggleSwitch,
  createGamepadBridge,
} from '@doot-games/ui'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { layoutFor } from './layouts'
import { consoleSpec } from './logic'
import { type ViewerState, createViewer, webrtcSupported } from './stream'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

interface Meta {
  console: string
  game: string
  max: number
}
interface Assign {
  seat: number
  console: string
}

const meta = ref<Meta | null>(null)
const assign = ref<Assign | null>(null)

const seat = computed(() => assign.value?.seat ?? -1)
const consoleKey = computed(() => meta.value?.console ?? assign.value?.console ?? 'nes')
const spec = computed(() => consoleSpec(consoleKey.value))
const layout = computed(() => layoutFor(spec.value.layoutKey))
const hasSeat = computed(() => seat.value >= 0)
// No assignment yet vs an explicit "no seat" (-1): the first is a normal wait, only
// the second is a genuinely full room.
const awaitingSeat = computed(() => meta.value != null && assign.value == null)

// ── Send input (only when seated) ────────────────────────────────────────────
function onInput(e: DigitalInputEvent) {
  if (!hasSeat.value) return
  room.publishExtra(`in/${myId.value}`, { id: e.id, v: e.pressed ? 1 : 0, src: e.source ?? 'touch' })
}
function onAxis(e: AnalogInputEvent) {
  if (!hasSeat.value) return
  room.publishExtra(`axis/${myId.value}`, { side: e.side, x: e.x, y: e.y })
}

// ── Button size (scales every control via --control-scale) ───────────────────
const SCALE: Record<string, number> = { S: 0.85, M: 1, L: 1.18, XL: 1.35 }
const sizeKey = ref('M')
const desiredScale = computed(() => SCALE[sizeKey.value] ?? 1)
// The size the user asked for, capped so the pad always fits: we apply the desired
// scale, then if the body overflows we shrink it back until it fits. So a bigger
// size grows the controls up to the edge of the screen and no further.
const appliedScale = ref(1)
const rootEl = ref<HTMLElement | null>(null)
let fitRaf = 0
function measureFit(iter: number) {
  const body = rootEl.value?.querySelector('.body') as HTMLElement | null
  if (!body) return
  // Measure the body's control rects against the body box. getBoundingClientRect is
  // transform-aware, so this catches a control nudged past an edge by a CSS transform
  // (the Sega arc, the d-pad inboard shift) that scrollHeight would miss; using the
  // body box (which already excludes the shoulder row's height) keeps a tall column
  // from overrunning into the shoulders.
  const box = body.getBoundingClientRect()
  let over = 0
  for (const el of body.querySelectorAll('.pad-btn, .dpad, .stick')) {
    const r = el.getBoundingClientRect()
    over = Math.max(over, box.top - r.top, r.bottom - box.bottom, box.left - r.left, r.right - box.right)
  }
  if (over > 2 && iter < 8 && appliedScale.value > 0.5) {
    const basis = Math.min(box.width, box.height) || 1
    // Shrink proportionally to the worst overhang (cap one step at -40%) and re-check.
    appliedScale.value = Math.max(0.5, appliedScale.value * Math.max(0.6, 1 - (over * 1.15) / basis))
    fitRaf = requestAnimationFrame(() => measureFit(iter + 1))
  }
}
function recomputeFit() {
  if (typeof requestAnimationFrame === 'undefined') return
  cancelAnimationFrame(fitRaf)
  appliedScale.value = desiredScale.value
  fitRaf = requestAnimationFrame(() => measureFit(0))
}
const SIZE_KEY = 'doot_arcade_size'
watch(sizeKey, (v) => {
  try {
    localStorage.setItem(SIZE_KEY, v)
  } catch {
    /* ignore */
  }
})
// Re-fit on size choice, console swap, and seating (orientation is handled in its
// own change handler, which is declared after isPortrait below).
watch([sizeKey, layout, hasSeat], () => requestAnimationFrame(recomputeFit))

const showSettings = ref(false)

// ── Orientation (portrait gets a different layout) ───────────────────────────
const isPortrait = ref(false)
let mq: MediaQueryList | null = null
function onOrient(e: { matches: boolean }) {
  isPortrait.value = e.matches
  requestAnimationFrame(recomputeFit)
  // nextTick so the orientation's <video> (mounted by v-if) exists before we re-point
  // the stream at it; a bare rAF can race Vue's DOM flush and silently miss it.
  if (watching.value) nextTick(reattachStream)
}

// ── Physical gamepad on the phone ────────────────────────────────────────────
let bridge: GamepadBridge | null = null
const gamepadName = ref<string | null>(null)
const useGamepad = ref(true)
const remapOpen = ref(false)
const remap = ref<Partial<GamepadMapping>>({})
let lastGpAxis = 0
function startBridge() {
  bridge?.stop()
  bridge = createGamepadBridge({
    mapping: remap.value,
    onInput: (e) => {
      if (useGamepad.value) onInput(e)
    },
    onAxis: (e) => {
      if (!useGamepad.value) return
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (e.x !== 0 || e.y !== 0) {
        if (now - lastGpAxis < 40) return
        lastGpAxis = now
      }
      onAxis(e)
    },
    onConnect: ({ id }) => {
      gamepadName.value = (id.split('(')[0] || 'Controller').trim().slice(0, 22) || 'Controller'
    },
    onDisconnect: () => {
      gamepadName.value = null
    },
  })
  bridge.start()
}
function onRemap(m: GamepadMapping) {
  remap.value = m
  bridge?.setMapping(m)
  try {
    localStorage.setItem(`doot_arcade_pad_${consoleKey.value}`, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}
function loadRemap(key: string) {
  let m: Partial<GamepadMapping> = {}
  try {
    const saved = localStorage.getItem(`doot_arcade_pad_${key}`)
    if (saved) m = JSON.parse(saved)
  } catch {
    /* ignore */
  }
  remap.value = m
  bridge?.setMapping(m)
}
// A host hot-swap changes the console: load that console's saved remap and apply it
// to the running bridge (it was only loaded once at mount otherwise).
watch(consoleKey, (key) => loadRemap(key))

// Relay subscriptions to release on unmount (the engine hands back an unsubscribe).
const offExtras: Array<() => void> = []

onMounted(() => {
  try {
    const saved = localStorage.getItem(SIZE_KEY)
    if (saved && saved in SCALE) sizeKey.value = saved
  } catch {
    /* storage blocked */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(orientation: portrait)')
    isPortrait.value = mq.matches
    mq.addEventListener('change', onOrient)
  }
  offExtras.push(
    room.onExtra('meta', (v) => {
      meta.value = (v as Meta | null) ?? null
    }),
  )
  offExtras.push(
    room.onExtra(`assign/${myId.value}`, (v) => {
      assign.value = (v as Assign | null) ?? null
    }),
  )
  loadRemap(consoleKey.value)
  startBridge()
  // Re-fit the controls whenever the play area changes size (rotation, browser
  // chrome, split screen). Caps the chosen button size to what actually fits.
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    ro = new ResizeObserver(() => requestAnimationFrame(recomputeFit))
    ro.observe(rootEl.value)
  }
  requestAnimationFrame(recomputeFit)
})
let ro: ResizeObserver | null = null
onUnmounted(() => {
  bridge?.stop()
  viewer?.close()
  mq?.removeEventListener('change', onOrient)
  ro?.disconnect()
  for (const off of offExtras) off()
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(fitRaf)
})

// ── Watch the game while you play (opt-in spectator stream) ───────────────────
// The video lives in the pad's centre column in landscape, or a floating top panel
// in portrait; only one is mounted at a time, and the viewer re-points on a flip.
const canWatch = webrtcSupported()
const watching = ref(false)
const watchSound = ref(false)
const watchState = ref<ViewerState>('connecting')
const landscapeVideo = ref<HTMLVideoElement | null>(null)
const portraitVideo = ref<HTMLVideoElement | null>(null)
const activeVideo = () => (isPortrait.value ? portraitVideo.value : landscapeVideo.value)
let viewer: ReturnType<typeof createViewer> | null = null
function reattachStream() {
  const v = activeVideo()
  if (v && viewer) viewer.attach(v)
}
function toggleWatch() {
  if (watching.value) {
    viewer?.close()
    viewer = null
    watching.value = false
    watchSound.value = false
    return
  }
  watching.value = true
  showSettings.value = false
  nextTick(() => {
    const v = activeVideo()
    if (!v) return
    viewer?.close() // guard against a double-tap leaving an orphan peer connection
    viewer = createViewer(room, v, (s) => (watchState.value = s))
  })
}
// Sound is opt-in (and off by default) since a player in the room hears the big
// screen; a REMOTE player taps it on. Audio autoplay needs this gesture.
function toggleWatchSound() {
  watchSound.value = !watchSound.value
  viewer?.setMuted(!watchSound.value)
}
function fullscreenStream() {
  activeVideo()?.requestFullscreen?.().catch(() => {})
}
function popoutStream() {
  if (typeof window === 'undefined') return
  window.open(`/watch/${room.code.value}`, 'doot_watch', 'width=760,height=560')
}
</script>

<template>
  <div ref="rootEl" class="arcade-player" :style="{ '--control-scale': appliedScale }">
    <!-- Waiting / status states -->
    <div v-if="!room.ready.value" class="msg"><h2>Joining...</h2></div>
    <div v-else-if="!meta" class="msg">
      <h2>You're in</h2>
      <p>Waiting for the host to load a game. Your controller appears here the moment it boots.</p>
    </div>
    <div v-else-if="awaitingSeat" class="msg">
      <h2>Getting your controller...</h2>
      <p>You're in. The host is handing you a player slot.</p>
    </div>
    <div v-else-if="!hasSeat" class="msg">
      <h2>Room full</h2>
      <p>All {{ spec.max }} controller slots are taken. You'll get one if a slot opens up.</p>
    </div>

    <!-- The controller -->
    <template v-else>
      <header class="strip">
        <span class="me">
          <Avatar :name="room.me.value.name" :id="myId" :size="26" />
          <span class="mname">{{ room.me.value.name }}</span>
          <span class="mtag mono">P{{ seat + 1 }} &middot; {{ spec.label }}</span>
        </span>
        <span class="acts">
          <button
            v-if="canWatch"
            class="watch-toggle"
            :class="{ on: watching }"
            :aria-pressed="watching"
            @click="toggleWatch"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2.5" y="4.5" width="19" height="13" rx="2" /><path d="M8 21h8M12 17.5V21" />
            </svg>
            <span class="wt-label">{{ watching ? 'Watching' : 'Watch' }}</span>
          </button>
          <span class="live mono" :class="{ on: room.connected.value }">{{ room.connected.value ? 'live' : '...' }}</span>
          <button class="cog" aria-label="Controller settings" @click="showSettings = !showSettings">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="4" y1="8" x2="20" y2="8" /><circle cx="15" cy="8" r="2.6" fill="var(--bg)" />
              <line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="16" r="2.6" fill="var(--bg)" />
            </svg>
          </button>
        </span>
      </header>

      <!-- Portrait: the live screen floats across the empty top, above the
           bottom-anchored controls. -->
      <div v-if="watching && isPortrait" class="pstream">
        <video ref="portraitVideo" class="pstream-vid" playsinline autoplay muted />
        <div class="watch-bar">
          <span class="watch-state mono">{{ watchState === 'connected' ? 'live' : watchState === 'failed' ? 'no signal' : 'connecting' }}</span>
          <span class="watch-acts">
            <button class="link-btn" :class="{ snd: watchSound }" @click="toggleWatchSound">{{ watchSound ? 'Sound on' : 'Sound' }}</button>
            <button class="link-btn" @click="popoutStream">Pop out</button>
            <button class="link-btn" @click="fullscreenStream">Fullscreen</button>
          </span>
        </div>
      </div>

      <ControllerPad class="pad-fill" :layout="layout" @input="onInput" @axis="onAxis">
        <!-- Landscape: the screen sits in the centre column, above the system
             buttons, so it never overlaps the d-pad or face buttons. -->
        <template v-if="watching && !isPortrait" #stream>
          <div class="watch">
            <video ref="landscapeVideo" class="watch-vid" playsinline autoplay muted />
            <div class="watch-bar">
              <span class="watch-state mono">{{ watchState === 'connected' ? 'live' : watchState === 'failed' ? 'no signal' : 'connecting' }}</span>
              <span class="watch-acts">
                <button class="link-btn" :class="{ snd: watchSound }" @click="toggleWatchSound">{{ watchSound ? 'Sound on' : 'Sound' }}</button>
                <button class="link-btn" @click="popoutStream">Pop out</button>
                <button class="link-btn" @click="fullscreenStream">Fullscreen</button>
              </span>
            </div>
          </div>
        </template>
      </ControllerPad>

      <!-- Quiet gamepad hint -->
      <button v-if="gamepadName && !showSettings" class="gp-hint" @click="showSettings = true">
        Controller detected, tap to use {{ gamepadName }}
      </button>

      <!-- Settings sheet -->
      <div v-if="showSettings" class="sheet" @click.self="showSettings = false">
        <div class="sheet-card">
          <div class="srow">
            <span class="slbl">Button size</span>
            <Segmented v-model="sizeKey" :options="[{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' }, { value: 'XL', label: 'XL' }]" />
          </div>
          <div v-if="gamepadName" class="srow">
            <span class="slbl">{{ gamepadName }}</span>
            <div class="gp-ctrls">
              <ToggleSwitch v-model="useGamepad" label="Use it" />
              <button class="link-btn" @click="remapOpen = true">Remap</button>
            </div>
          </div>
          <div class="srow end">
            <ConnChip :status="room.connected.value ? 'connected' : 'connecting'" />
            <button class="link-btn" @click="showSettings = false">Done</button>
          </div>
        </div>
      </div>

      <div v-if="remapOpen" class="modal" @click.self="remapOpen = false">
        <GamepadMapper :layout="layout" :model-value="remap" @update:model-value="onRemap" @done="remapOpen = false" />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Full-screen: escape the narrow phone column so the controller owns the device,
   and fill the viewport height like the prototype's #pad. */
.arcade-player {
  position: fixed;
  inset: 0;
  z-index: 30;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
  touch-action: none;
}
.msg {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 24px;
}
.msg h2 {
  font-size: clamp(24px, 6.5vw, 34px);
  font-weight: 800;
}
.msg p {
  color: var(--ink-soft);
  max-width: 32ch;
  line-height: 1.45;
}

/* Thin top strip */
.strip {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px max(10px, env(safe-area-inset-right)) 6px max(10px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--line-soft);
}
.me {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mname {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtag {
  font-size: 10px;
  color: var(--mute);
  letter-spacing: 0.06em;
}
.acts {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.watch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.watch-toggle.on {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--primary);
}
.watch-acts {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}
.live {
  font-size: 11px;
  color: var(--mute);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.live.on {
  color: var(--c5);
}
.cog {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
}

/* The pad fills the rest of the screen. Tight side padding (like the prototype's
   #pad) so the widest layout (N64) never clips; the bottom keeps the safe area. */
.pad-fill {
  flex: 1 1 auto;
  min-height: 0;
  padding: 2px 6px max(6px, env(safe-area-inset-bottom));
}

/* Landscape stream, embedded in the pad's centre column. */
.watch {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
}
.watch-vid {
  width: 100%;
  max-height: 46vh;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: #000;
  border: var(--bd) solid var(--line);
  border-radius: calc(var(--radius) - 4px);
  box-shadow: var(--shadow-sm);
}
.watch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.watch-state {
  font-size: 11px;
  color: var(--mute);
}

/* Portrait stream: floats across the empty top, above the bottom-anchored pad. */
.pstream {
  position: absolute;
  /* Below the header + the shoulder row, so triggers like the N64 Z stay visible. */
  top: 104px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: min(82vw, 440px);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pstream-vid {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: #000;
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

/* Settings sheet (overlay) */
.sheet {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 56px 16px 16px;
  background: color-mix(in srgb, var(--ink) 30%, transparent);
}
.sheet-card {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.srow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.slbl {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.gp-ctrls {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.link-btn {
  background: none;
  border: none;
  color: var(--primary);
  font-weight: 700;
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;
}
.link-btn.snd {
  color: var(--c5);
}
.gp-hint {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  color: var(--ink-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
}
.modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ink) 42%, transparent);
  padding: 16px;
}
</style>
