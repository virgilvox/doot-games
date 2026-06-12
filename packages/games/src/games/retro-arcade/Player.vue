<script setup lang="ts">
/**
 * Retro Arcade phone controller. Reads the live console from `/x/meta` and this
 * phone's seat from `/x/assign/<pid>`, renders the kit's ControllerPad for that
 * console, and forwards every input to the host over `/x/in/<pid>` (a logical
 * button) and `/x/axis/<pid>` (a stick). The same logical events come from the
 * touch controls and from a USB/Bluetooth gamepad plugged into the phone, so they
 * are interchangeable. A size control scales the whole pad; a quiet hint surfaces
 * a connected gamepad with an optional remap. When the host hot-swaps to a
 * different console, `meta` changes and the pad re-skins automatically.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import {
  type AnalogInputEvent,
  ConnChip,
  ControllerPad,
  type DigitalInputEvent,
  type GamepadBridge,
  GamepadMapper,
  type GamepadMapping,
  PlayerHeader,
  Segmented,
  ToggleSwitch,
  createGamepadBridge,
} from '@doot-games/ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

// ── Send input (only when seated) ────────────────────────────────────────────
function onInput(e: DigitalInputEvent) {
  if (!hasSeat.value) return
  room.publishExtra(`in/${myId.value}`, {
    id: e.id,
    v: e.pressed ? 1 : 0,
    src: e.source ?? 'touch',
  })
}
function onAxis(e: AnalogInputEvent) {
  if (!hasSeat.value) return
  room.publishExtra(`axis/${myId.value}`, { side: e.side, x: e.x, y: e.y })
}

// ── Button size (persisted per device, with a safe default) ──────────────────
const SCALE: Record<string, number> = { S: 0.8, M: 1, L: 1.25, XL: 1.5 }
const sizeKey = ref('M')
const controlScale = computed(() => SCALE[sizeKey.value] ?? 1)
const SIZE_KEY = 'doot_arcade_size'
onMounted(() => {
  try {
    const saved = localStorage.getItem(SIZE_KEY)
    if (saved && saved in SCALE) sizeKey.value = saved
  } catch {
    /* storage blocked: keep the default */
  }
})
watch(sizeKey, (v) => {
  try {
    localStorage.setItem(SIZE_KEY, v)
  } catch {
    /* ignore */
  }
})
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
      // The bridge can fire every frame (~60Hz); throttle to ~25Hz so we don't
      // flood the relay (publishExtra is a retained set, not a lossy stream).
      // Always pass a zeroed (release) sample through so a recenter isn't dropped.
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
  // Wait for the <video> to mount, then connect.
  requestAnimationFrame(() => {
    if (streamVideo.value) viewer = createViewer(room, streamVideo.value, (s) => (watchState.value = s))
  })
}
function fullscreenStream() {
  streamVideo.value?.requestFullscreen?.().catch(() => {})
}
function popoutStream() {
  if (typeof window === 'undefined') return
  window.open(`/watch/${room.runtime.room}`, 'doot_watch', 'width=720,height=560')
}
</script>

<template>
  <div class="arcade-player">
    <!-- Waiting for the host to load a game -->
    <div v-if="!room.ready.value" class="msg"><h2>Joining...</h2></div>
    <div v-else-if="!meta" class="msg">
      <h2>You're in</h2>
      <p>Waiting for the host to load a game. Your controller appears here the moment it boots.</p>
    </div>
    <div v-else-if="!hasSeat" class="msg">
      <h2>Room full</h2>
      <p>All {{ spec.max }} controller slots are taken. You'll get one if a slot opens up.</p>
    </div>

    <!-- The controller -->
    <template v-else>
      <header class="bar">
        <PlayerHeader :name="room.me.value.name" :id="myId" :status="`P${seat + 1} · ${spec.label}`" />
        <button class="cog" :aria-expanded="showSettings" aria-label="Controller settings" @click="showSettings = !showSettings">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="4" y1="8" x2="20" y2="8" /><circle cx="15" cy="8" r="2.6" fill="var(--surface)" />
            <line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="16" r="2.6" fill="var(--surface)" />
          </svg>
        </button>
      </header>

      <div v-if="showSettings" class="settings">
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
        <div v-if="canWatch" class="srow">
          <span class="slbl">Watch the game</span>
          <div class="gp-ctrls">
            <ToggleSwitch :model-value="watching" label="On screen" @update:model-value="toggleWatch" />
            <button class="link-btn" @click="popoutStream">Pop out</button>
          </div>
        </div>
        <ConnChip :status="room.connected.value ? 'connected' : 'connecting'" />
      </div>

      <!-- Watch-while-you-play: the live screen above the controls -->
      <div v-if="watching" class="watch">
        <video ref="streamVideo" class="watch-vid" playsinline autoplay muted />
        <div class="watch-bar">
          <span class="watch-state mono">{{ watchState === 'connected' ? 'live' : watchState === 'failed' ? 'no signal (needs the host broadcasting)' : 'connecting' }}</span>
          <button class="link-btn" @click="fullscreenStream">Fullscreen</button>
        </div>
      </div>

      <!-- A quiet, dismissible hint when a gamepad is detected but settings are closed -->
      <button v-if="gamepadName && !showSettings" class="gp-hint" @click="showSettings = true">
        Controller detected, tap to use {{ gamepadName }}
      </button>

      <div class="pad-wrap" :style="{ '--control-scale': controlScale }">
        <ControllerPad :layout="layout" @input="onInput" @axis="onAxis" />
      </div>

      <div v-if="remapOpen" class="modal" @click.self="remapOpen = false">
        <GamepadMapper :layout="layout" :model-value="remap" @update:model-value="onRemap" @done="remapOpen = false" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.arcade-player { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; height: 100%; }
.msg { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; }
.msg h2 { font-size: clamp(24px, 6.5vw, 34px); font-weight: 800; }
.msg p { color: var(--ink-soft); max-width: 32ch; line-height: 1.45; }
.bar { display: flex; align-items: center; gap: 10px; }
.cog { flex: none; width: 44px; height: 44px; border-radius: 50%; border: var(--bd) solid var(--line); background: var(--surface); color: var(--ink); font-size: 18px; cursor: pointer; }
.settings { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: var(--bd) solid var(--line); border-radius: var(--radius); background: var(--surface); }
.srow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.slbl { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); }
.gp-ctrls { display: inline-flex; align-items: center; gap: 12px; }
.link-btn { background: none; border: none; color: var(--primary); font-weight: 700; cursor: pointer; font-size: 13px; text-decoration: underline; }
.gp-hint { align-self: center; border: var(--bd) solid var(--line); background: var(--surface-2); color: var(--ink-soft); border-radius: 999px; padding: 7px 14px; font-size: 12px; font-family: var(--font-mono); cursor: pointer; }
/* Contain the pad: an oversized button-size (XL on a small portrait screen)
   clips within the play area rather than scrolling the whole document. */
.watch { display: flex; flex-direction: column; gap: 4px; }
.watch-vid { width: 100%; max-height: 30vh; aspect-ratio: 4 / 3; object-fit: contain; background: #000; border: var(--bd) solid var(--line); border-radius: calc(var(--radius) - 4px); }
.watch-bar { display: flex; align-items: center; justify-content: space-between; }
.watch-state { font-size: 11px; color: var(--mute); }
.pad-wrap { flex: 1; min-height: 0; min-width: 0; display: flex; overflow: hidden; }
.pad-wrap > * { flex: 1; min-width: 0; }
.modal { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--ink) 42%, transparent); padding: 16px; }
</style>
