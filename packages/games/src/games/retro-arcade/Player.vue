<script setup lang="ts">
/**
 * Retro Arcade phone controller. A full-screen landscape gamepad built the way the
 * Doot emulator prototype does it: the controller is a `100dvh` flex column with a
 * thin status strip on top and the kit's ControllerPad filling the rest, the
 * controls self-sizing with `vmin` clamps so they fit any phone with no measuring
 * or transforms. It reads the console from `/x/meta` and this phone's seat from
 * `/x/assign/<pid>`, and forwards every input to the host over `/x/in/<pid>` (a
 * logical button) and `/x/axis/<pid>` (a stick); touch and a plugged-in gamepad
 * emit the same events. When the host hot-swaps a console, `meta` changes and the
 * pad re-skins. Watching the game is opt-in and renders INSIDE the pad's centre
 * column (never over a button).
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
  ToggleSwitch,
  createGamepadBridge,
} from '@doot-games/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
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

const showSettings = ref(false)

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

onMounted(() => {
  room.onExtra('meta', (v) => {
    meta.value = (v as Meta | null) ?? null
  })
  room.onExtra(`assign/${myId.value}`, (v) => {
    assign.value = (v as Assign | null) ?? null
  })
  try {
    const saved = localStorage.getItem(`doot_arcade_pad_${consoleKey.value}`)
    if (saved) remap.value = JSON.parse(saved)
  } catch {
    /* ignore */
  }
  startBridge()
})
onUnmounted(() => {
  bridge?.stop()
  viewer?.close()
})

// ── Watch the game while you play (opt-in spectator stream) ───────────────────
const canWatch = webrtcSupported()
const watching = ref(false)
const watchState = ref<ViewerState>('connecting')
const streamVideo = ref<HTMLVideoElement | null>(null)
let viewer: ReturnType<typeof createViewer> | null = null
function toggleWatch() {
  if (watching.value) {
    viewer?.close()
    viewer = null
    watching.value = false
    return
  }
  watching.value = true
  showSettings.value = false
  requestAnimationFrame(() => {
    if (streamVideo.value) viewer = createViewer(room, streamVideo.value, (s) => (watchState.value = s))
  })
}
function fullscreenStream() {
  streamVideo.value?.requestFullscreen?.().catch(() => {})
}
function popoutStream() {
  if (typeof window === 'undefined') return
  window.open(`/watch/${room.runtime.room}`, 'doot_watch', 'width=760,height=560')
}
</script>

<template>
  <div class="arcade-player">
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
          <span class="live mono" :class="{ on: room.connected.value }">{{ room.connected.value ? 'live' : '...' }}</span>
          <button class="cog" aria-label="Controller settings" @click="showSettings = !showSettings">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="4" y1="8" x2="20" y2="8" /><circle cx="15" cy="8" r="2.6" fill="var(--bg)" />
              <line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="16" r="2.6" fill="var(--bg)" />
            </svg>
          </button>
        </span>
      </header>

      <ControllerPad class="pad-fill" :layout="layout" @input="onInput" @axis="onAxis">
        <!-- The live screen sits in the centre column, above the system buttons,
             so it never overlaps the d-pad or face buttons. -->
        <template v-if="watching" #stream>
          <div class="watch">
            <video ref="streamVideo" class="watch-vid" playsinline autoplay muted />
            <div class="watch-bar">
              <span class="watch-state mono">{{ watchState === 'connected' ? 'live' : watchState === 'failed' ? 'no signal' : 'connecting' }}</span>
              <button class="link-btn" @click="fullscreenStream">Fullscreen</button>
            </div>
          </div>
        </template>
      </ControllerPad>

      <!-- Only shown in portrait: a landscape pad is cramped held upright. -->
      <div class="rotate-hint">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M7 3.5a4 4 0 0 1 4 0M7 20.5a4 4 0 0 0 4 0" />
        </svg>
        Rotate to landscape for the full controller
      </div>

      <!-- Quiet gamepad hint -->
      <button v-if="gamepadName && !showSettings" class="gp-hint" @click="showSettings = true">
        Controller detected, tap to use {{ gamepadName }}
      </button>

      <!-- Settings sheet -->
      <div v-if="showSettings" class="sheet" @click.self="showSettings = false">
        <div class="sheet-card">
          <div v-if="gamepadName" class="srow">
            <span class="slbl">{{ gamepadName }}</span>
            <div class="gp-ctrls">
              <ToggleSwitch v-model="useGamepad" label="Use it" />
              <button class="link-btn" @click="remapOpen = true">Remap</button>
            </div>
          </div>
          <div v-if="canWatch" class="srow">
            <span class="slbl">Watch the game</span>
            <div class="gp-ctrls">
              <ToggleSwitch :model-value="watching" label="On screen" @update:model-value="toggleWatch" />
              <button class="link-btn" @click="popoutStream">Pop out</button>
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
   and fill the viewport height like the prototype's `#pad`. */
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

/* Stream embedded in the pad's centre column (watch-while-play). */
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
.rotate-hint {
  display: none;
}
@media (orientation: portrait) {
  .rotate-hint {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 9px;
    width: max-content;
    max-width: calc(100% - 24px);
    padding: 9px 14px;
    border: var(--bd) solid var(--line);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink-soft);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
  }
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
