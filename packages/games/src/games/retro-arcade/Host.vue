<script setup lang="ts">
/**
 * Retro Arcade host, the big-screen emulator. A custom-flow Host that parks the
 * engine on the single `arcade` round and drives everything over the relay's
 * custom channels:
 *   - `/x/meta`        (host -> all, retained): the live console + game name, so a
 *                       phone knows which controller layout to render (and rebuilds
 *                       it when the host hot-swaps to a different console).
 *   - `/x/assign/<pid>`(host -> phone, retained): the seat (player slot) a phone got,
 *                       or -1 if the room is full.
 *   - `/x/in/<pid>`    (phone -> host): a logical button transition `{id, v, src}`.
 *   - `/x/axis/<pid>`  (phone -> host): an analog stick sample `{side, x, y}`.
 * Seats are one shared pool: a gamepad plugged into the host machine takes a slot,
 * a phone joining takes the next, so one pad + one phone are P1 and P2. The host
 * maps every input (touch id, the phone's own gamepad, or a host gamepad) through
 * the pure, tested console table in `logic.ts` to an EmulatorJS input.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import {
  ConnChip,
  DButton,
  type GamepadBridge,
  QrCode,
  RoomTicket,
  createGamepadBridge,
} from '@doot-games/ui'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { type EmulatorController, createEmulator } from './emulator'
import { serveStream, webrtcSupported } from './stream'
import {
  CBTN_BY_DIR,
  CONSOLE_LIST,
  type ConsoleSpec,
  aliasToTouch,
  analogToEmu,
  axisToDirections,
  consoleSpec,
  detectConsole,
  emuIndexFor,
  gameNameOf,
  nextFreeSeat,
  simValueFor,
} from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const MOUNT = '#arcade-screen'
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})

// ── ROM selection (lobby + hot-swap) ─────────────────────────────────────────
const romSrc = ref<string | null>(null)
const romName = ref('game')
/** A remote ROM URL (vs a local blob), the only kind that can be shared by link. */
const romUrl = ref<string | null>(null)
/** The text shown in the "ROM URL" field (so a deep link / paste is reflected). */
const romUrlField = ref('')
const consoleKey = ref('nes')
const spec = computed<ConsoleSpec>(() => consoleSpec(consoleKey.value))
const dragHot = ref(false)
const booted = ref(false)
const toast = ref('')
/** The "Swap ROM" modal (keeps the live view uncluttered). */
const swapOpen = ref(false)

function setToast(m: string) {
  toast.value = m
  if (typeof window !== 'undefined') setTimeout(() => (toast.value = ''), 1600)
}

/** Free a prior local-ROM blob URL so repeated loads/swaps don't leak the ROM. */
function revokeBlob() {
  if (romSrc.value?.startsWith('blob:')) URL.revokeObjectURL(romSrc.value)
}
/** The loaded ROM's file name with extension (for the "loaded" indicator). */
const romFileName = ref<string | null>(null)
function takeFile(file: File | null | undefined) {
  if (!file) return
  revokeBlob()
  romSrc.value = URL.createObjectURL(file)
  romUrl.value = null
  romUrlField.value = '' // a local file isn't a URL
  romName.value = gameNameOf(file.name)
  romFileName.value = file.name
  const d = detectConsole(file.name)
  if (d) consoleKey.value = d
}
function takeUrl(raw: string) {
  romUrlField.value = raw
  const v = raw.trim()
  if (!v) {
    romUrl.value = null
    romSrc.value = null
    romFileName.value = null
    return
  }
  revokeBlob()
  romSrc.value = v
  romUrl.value = v
  romName.value = gameNameOf(v)
  romFileName.value = v.split('/').pop() ?? v
  const d = detectConsole(v)
  if (d) consoleKey.value = d
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragHot.value = false
  takeFile(e.dataTransfer?.files?.[0])
}

// A shareable deep link (only for a remote ROM url, since a local file can't travel).
const shareUrl = computed(() => {
  if (!romUrl.value || typeof window === 'undefined') return null
  const u = new URL('/host/retro-arcade', window.location.origin)
  u.searchParams.set('rom', romUrl.value)
  u.searchParams.set('core', consoleKey.value)
  return u.toString()
})
function copyShare() {
  const link = shareUrl.value
  if (!link) return
  navigator.clipboard
    ?.writeText(link)
    .then(() => setToast('Share link copied'))
    .catch(() => setToast('Copy failed'))
}
/** Copy the player join link (what the QR encodes), the common "send it to people" action. */
function copyJoin() {
  navigator.clipboard
    ?.writeText(joinUrl.value)
    .then(() => setToast('Join link copied'))
    .catch(() => setToast('Copy failed'))
}

// ── Emulator ─────────────────────────────────────────────────────────────────
let emu: EmulatorController | null = null
const themeColor = () => {
  if (typeof window === 'undefined') return '#ff5a33'
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#ff5a33'
  )
}

function boot() {
  if (!romSrc.value || !emu) return
  booted.value = true
  room.host.start()
  emu.boot({
    src: romSrc.value,
    core: spec.value.core,
    name: romName.value,
    color: themeColor(),
    threaded: spec.value.threaded,
    onError: setToast,
  })
  publishMeta()
  reconcileSeats()
  scanHostGamepads()
  startStream()
}

/** Hot-swap a new ROM (and maybe console) into the running session. */
function swap() {
  if (!romSrc.value || !emu) return
  emu.reboot({
    src: romSrc.value,
    core: spec.value.core,
    name: romName.value,
    color: themeColor(),
    threaded: spec.value.threaded,
    onError: setToast,
  })
  for (const k of Object.keys(axisPrev)) delete axisPrev[Number(k)]
  publishMeta()
  reconcileSeats() // republish so phones rebuild their pad for the new console
  swapOpen.value = false
  setToast(`Loaded ${romName.value}`)
}

function publishMeta() {
  room.publishExtra('meta', {
    console: consoleKey.value,
    game: romName.value,
    max: spec.value.max,
  })
}

// ── Seats: one pool shared by host gamepads and phones ───────────────────────
type Seat =
  | { kind: 'phone'; pid: string; name: string }
  | { kind: 'gamepad'; padIndex: number; name: string }
const seats = reactive<Array<Seat | null>>([])
const seatOf = (pid: string) => seats.findIndex((s) => s?.kind === 'phone' && s.pid === pid)
const padSeat = (padIndex: number) =>
  seats.findIndex((s) => s?.kind === 'gamepad' && s.padIndex === padIndex)

function ensureLen() {
  while (seats.length < spec.value.max) seats.push(null)
}
function publishAssign(pid: string, seat: number) {
  room.publishExtra(`assign/${pid}`, { seat, console: consoleKey.value })
}

/**
 * Bring the seat pool in line with the live roster: lay out the empty slots, free
 * a seat whose phone left, seat any new phone in the next opening, and (re)publish
 * every phone's assignment. Called on boot, whenever the roster changes, and after
 * a console swap (so phones get the new console + rebuild their pad).
 */
function reconcileSeats() {
  // Re-assert the meta every time the roster changes, so a phone that joined a
  // beat too early (or missed the retained value) still learns the console.
  publishMeta()
  // Hot-swap to a fewer-controller console (e.g. N64 max 4 -> Game Boy max 1):
  // drop every seat past the new max, releasing host gamepads that lose a slot.
  // A displaced phone falls through to a -1 assignment below ("room full").
  while (seats.length > spec.value.max) {
    const s = seats.pop()
    if (s?.kind === 'gamepad') releaseGamepad(s.padIndex)
  }
  ensureLen()
  const present = new Set(room.players.value.map((p) => p.id))
  seats.forEach((s, i) => {
    if (s?.kind === 'phone' && !present.has(s.pid)) seats[i] = null
  })
  for (const p of room.players.value) {
    if (seatOf(p.id) < 0) {
      const free = nextFreeSeat(seats, spec.value.max)
      if (free >= 0) seats[free] = { kind: 'phone', pid: p.id, name: p.name }
    }
    publishAssign(p.id, seatOf(p.id))
  }
}

watch(
  () => room.players.value.map((p) => p.id).join(','),
  () => {
    if (booted.value) reconcileSeats()
  },
)

// ── Input routing ────────────────────────────────────────────────────────────
// Per-seat previous d-pad/C-button state, so an analog stick driving digital
// directions only fires on a real change.
const axisPrev = reactive<
  Record<number, { left?: Record<string, boolean>; right?: Record<string, boolean> }>
>({})

function applyDigital(seat: number, id: string, pressed: boolean, isGamepad: boolean) {
  if (seat < 0 || !emu) return
  const s = spec.value
  const touchId = isGamepad ? aliasToTouch(s, id) : id
  if (!touchId) return
  const index = emuIndexFor(s, touchId)
  if (index == null) return
  // Full-scale for analog-axis indices (N64 C-buttons live on the right stick),
  // else a plain digital 1; 0 on release.
  emu.simulate(seat, index, simValueFor(index, pressed))
}

function applyAxis(seat: number, side: 'left' | 'right', x: number, y: number) {
  if (seat < 0 || !emu) return
  const s = spec.value
  if (side === 'left') {
    if (s.leftStick === 'analog') {
      for (const [idx, val] of analogToEmu(x, y, 16)) emu.simulate(seat, idx, val)
    } else {
      diffDirections(seat, 'left', axisToDirections(x, y), {
        up: 'up',
        down: 'down',
        left: 'left',
        right: 'right',
      })
    }
  } else {
    if (s.rightStick === 'analog2') {
      for (const [idx, val] of analogToEmu(x, y, 20)) emu.simulate(seat, idx, val)
    } else if (s.rightStick === 'cbtns') {
      diffDirections(seat, 'right', axisToDirections(x, y), CBTN_BY_DIR)
    }
  }
}

function diffDirections(
  seat: number,
  side: 'left' | 'right',
  dirs: Record<string, boolean>,
  ids: Record<string, string>,
) {
  const prev = (axisPrev[seat] ??= {})
  const was = (prev[side] ??= { up: false, down: false, left: false, right: false })
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    if (was[dir] === dirs[dir]) continue
    was[dir] = dirs[dir]!
    applyDigital(seat, ids[dir]!, dirs[dir]!, false)
  }
}

// ── Host-connected gamepads ──────────────────────────────────────────────────
const hostPads = reactive<Array<{ index: number; id: string; seat: number }>>([])
const bridges = new Map<number, GamepadBridge>()

function claimGamepad(index: number, id: string) {
  if (padSeat(index) >= 0) return
  ensureLen()
  const free = nextFreeSeat(seats, spec.value.max)
  if (free < 0) return // room full
  const short = (id.split('(')[0] || 'Gamepad').trim().slice(0, 18) || 'Gamepad'
  seats[free] = { kind: 'gamepad', padIndex: index, name: short }
  hostPads.push({ index, id: short, seat: free })
  // Resolve the seat live (not the captured `free`), so a seat trim/compaction
  // can never leave a host pad driving a slot it no longer owns.
  const bridge = createGamepadBridge({
    padIndex: index,
    onInput: (e) => applyDigital(padSeat(index), e.id, e.pressed, true),
    onAxis: (e) => applyAxis(padSeat(index), e.side, e.x, e.y),
  })
  bridge.start()
  bridges.set(index, bridge)
}
function releaseGamepad(index: number) {
  const seat = padSeat(index)
  if (seat >= 0) seats[seat] = null
  const hp = hostPads.findIndex((p) => p.index === index)
  if (hp >= 0) hostPads.splice(hp, 1)
  bridges.get(index)?.stop()
  bridges.delete(index)
}
function scanHostGamepads() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return
  for (const gp of navigator.getGamepads()) if (gp?.connected) claimGamepad(gp.index, gp.id)
}
function onGamepadConnected(e: Event) {
  if (!booted.value) return
  const gp = (e as GamepadEvent).gamepad
  claimGamepad(gp.index, gp.id)
}
function onGamepadDisconnected(e: Event) {
  releaseGamepad((e as GamepadEvent).gamepad.index)
}

// ── Wire up ──────────────────────────────────────────────────────────────────
onMounted(() => {
  emu = createEmulator(MOUNT)

  // Deep-link: ?rom=...&core=... boots straight into a ROM.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const qRom = params?.get('rom')
  const qCore = params?.get('core')
  if (qRom) {
    takeUrl(qRom)
    if (qCore && consoleSpec(qCore).key === qCore) consoleKey.value = qCore
  }

  room.onExtra('in/*', (v, key) => {
    const pid = key.split('/')[1]
    const seat = pid ? seatOf(pid) : -1
    const msg = v as { id?: string; v?: number; src?: string } | null
    if (seat < 0 || !msg?.id) return
    applyDigital(seat, msg.id, !!msg.v, msg.src === 'gamepad')
  })
  room.onExtra('axis/*', (v, key) => {
    const pid = key.split('/')[1]
    const seat = pid ? seatOf(pid) : -1
    const msg = v as { side?: 'left' | 'right'; x?: number; y?: number } | null
    if (seat < 0 || !msg?.side) return
    applyAxis(seat, msg.side, msg.x ?? 0, msg.y ?? 0)
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('gamepadconnected', onGamepadConnected)
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected)
  }
})
onUnmounted(() => {
  for (const b of bridges.values()) b.stop()
  bridges.clear()
  offViewers?.()
  streamServer?.stop()
  emu?.dispose()
  revokeBlob()
  if (typeof window !== 'undefined') {
    window.removeEventListener('gamepadconnected', onGamepadConnected)
    window.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
  }
})

const filledSeats = computed(() => seats.filter(Boolean).length)

// ── Spectator broadcast (CLASP-signaled WebRTC, auto on first viewer) ─────────
// The server is armed at boot but captures nothing until someone actually asks
// to watch (the canvas captureStream happens lazily inside `serveStream` on the
// first viewer hello), so there's no cost or manual toggle, it just works when a
// phone taps "watch" or anyone opens /watch/<code>.
const canBroadcast = webrtcSupported()
const viewerCount = ref(0)
let streamServer: ReturnType<typeof serveStream> | null = null
let offViewers: (() => void) | null = null
function startStream() {
  if (!canBroadcast || streamServer) return
  streamServer = serveStream(
    room,
    () => emu?.getCanvas() ?? null,
    () => emu?.getAudioStream() ?? null,
  )
  offViewers = streamServer.onViewerCount((n) => {
    viewerCount.value = n
  })
}

// ── Resizable screen (drag the corner; persisted per device) ─────────────────
const screenW = ref<number | null>(null)
const SCREEN_KEY = 'doot_arcade_screenw'
onMounted(() => {
  try {
    const s = localStorage.getItem(SCREEN_KEY)
    if (s) screenW.value = Number(s)
  } catch {
    /* storage blocked */
  }
})
let resizing = false
function startResize(e: PointerEvent) {
  e.preventDefault()
  resizing = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* best effort */
  }
}
function onResize(e: PointerEvent) {
  if (!resizing || typeof document === 'undefined') return
  const wrap = document.querySelector('.screen-wrap') as HTMLElement | null
  if (!wrap) return
  const left = wrap.getBoundingClientRect().left
  screenW.value = Math.max(320, Math.round(e.clientX - left))
}
function endResize() {
  if (!resizing) return
  resizing = false
  try {
    if (screenW.value) localStorage.setItem(SCREEN_KEY, String(Math.round(screenW.value)))
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <!-- LOBBY: load a ROM -->
  <div v-if="!booted" class="lobby">
    <section class="panel ticket-card">
      <RoomTicket :code="room.runtime.room" :url="joinUrl" />
      <p class="ticket-note">
        Players join from their phone, or
        <b>plug a USB / Bluetooth gamepad into this machine</b> and it takes a slot too.
      </p>
    </section>

    <section class="panel load-card">
      <h2>Load a ROM</h2>
      <p class="hint">It stays in your browser. Nothing uploads anywhere.</p>
      <label
        class="drop"
        :class="{ hot: dragHot, loaded: !!romSrc }"
        @dragenter.prevent="dragHot = true"
        @dragover.prevent="dragHot = true"
        @dragleave.prevent="dragHot = false"
        @drop="onDrop"
      >
        <input type="file" hidden @change="takeFile(($event.target as HTMLInputElement).files?.[0])" />
        <template v-if="romSrc">
          <span class="drop-badge">{{ spec.label }} ready</span>
          <strong class="rom-name">{{ romFileName ?? romName }}</strong>
          <small>Drop another ROM or tap to replace</small>
        </template>
        <template v-else>
          <strong>Drop a ROM</strong> or tap to pick a file
          <small>.nes .sfc .smc .n64 .z64 .gb .gbc .gba .md .pce .iso .cue ...</small>
        </template>
      </label>

      <div class="row">
        <label class="field">
          <span class="flbl">or paste a ROM URL</span>
          <input type="text" placeholder="https://example.com/game.nes" autocomplete="off" spellcheck="false" :value="romUrlField" @input="takeUrl(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field sysf">
          <span class="flbl">Console</span>
          <select v-model="consoleKey">
            <option v-for="c in CONSOLE_LIST" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </label>
      </div>

      <p v-if="romSrc" class="detected">Ready to boot &middot; <b>{{ romName }}</b> &middot; {{ spec.label }}</p>
      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!romSrc" @click="boot">Boot &amp; open room</DButton>
        <DButton v-if="shareUrl" variant="ghost" @click="copyShare">Copy share link</DButton>
      </div>
    </section>
  </div>

  <!-- LIVE: the emulator on the big screen, a compact seat strip under it, and a
       lean join card beside it (QR + copy link + swap). Swap details live in a modal. -->
  <div v-else class="live">
    <div class="top">
      <div class="screen-col" :style="{ '--screen-w': screenW ? `${screenW}px` : undefined }">
        <div class="screen-wrap">
          <div id="arcade-screen" class="screen" />
          <div
            class="resize-h"
            title="Drag to resize the screen"
            @pointerdown="startResize"
            @pointermove="onResize"
            @pointerup="endResize"
            @pointercancel="endResize"
          />
        </div>
        <ul class="seatbar" :aria-label="`Controllers, ${filledSeats} of ${spec.max} taken`">
          <li v-for="(s, i) in seats" :key="i" class="chip" :class="{ on: !!s }">
            <span class="cp">P{{ i + 1 }}</span>
            <span class="cn">
              <template v-if="s?.kind === 'gamepad'"><span class="pad-tag">PAD</span> {{ s.name }}</template>
              <template v-else-if="s?.kind === 'phone'">{{ s.name }}</template>
              <template v-else>open</template>
            </span>
          </li>
        </ul>
      </div>

      <aside class="join">
        <div class="join-head">
          <span class="join-lbl">Scan to play</span>
          <ConnChip :status="room.connected.value ? 'connected' : 'connecting'" />
        </div>
        <QrCode :value="joinUrl" :size="150" />
        <span class="big-code">{{ room.runtime.room }}</span>
        <p class="join-url mono">{{ joinUrl.replace(/^https?:\/\//, '') }}</p>
        <p class="join-count">
          <b>{{ filledSeats }}</b> / {{ spec.max }} controllers
          <span v-if="viewerCount" class="watching">&middot; {{ viewerCount }} watching</span>
        </p>
        <div class="join-btns">
          <DButton size="sm" block @click="copyJoin">Copy link</DButton>
          <DButton variant="ghost" size="sm" block @click="swapOpen = true">Swap ROM</DButton>
        </div>
        <p class="watch-note mono">Watch live at /watch/{{ room.runtime.room }}</p>
      </aside>
    </div>

    <!-- Swap ROM modal -->
    <div v-if="swapOpen" class="modal" @click.self="swapOpen = false">
      <div class="modal-card">
        <div class="modal-h">
          <h3>Swap ROM</h3>
          <button class="x" aria-label="Close" @click="swapOpen = false">&times;</button>
        </div>
        <p class="modal-now">Now playing <b>{{ romName }}</b> &middot; {{ spec.label }}</p>
        <label
          class="drop"
          :class="{ hot: dragHot }"
          @dragenter.prevent="dragHot = true"
          @dragover.prevent="dragHot = true"
          @dragleave.prevent="dragHot = false"
          @drop="onDrop"
        >
          <input type="file" hidden @change="takeFile(($event.target as HTMLInputElement).files?.[0])" />
          <strong>Drop a ROM</strong> or tap to pick a file
          <small>.nes .sfc .smc .n64 .z64 .gb .gbc .gba .md .pce .iso .cue ...</small>
        </label>
        <div class="row">
          <label class="field">
            <span class="flbl">or paste a ROM URL</span>
            <input type="text" placeholder="https://example.com/game.nes" autocomplete="off" spellcheck="false" :value="romUrlField" @input="takeUrl(($event.target as HTMLInputElement).value)" />
          </label>
          <label class="field sysf">
            <span class="flbl">Console</span>
            <select v-model="consoleKey" class="swap-sys"><option v-for="c in CONSOLE_LIST" :key="c.key" :value="c.key">{{ c.label }}</option></select>
          </label>
        </div>
        <p v-if="romSrc" class="detected">Ready &middot; <b>{{ romName }}</b> &middot; {{ spec.label }}</p>
        <div class="modal-actions">
          <DButton variant="primary" :disabled="!romSrc" @click="swap">Swap ROM</DButton>
          <DButton v-if="shareUrl" variant="ghost" @click="copyShare">Copy share link</DButton>
          <DButton variant="ghost" @click="swapOpen = false">Cancel</DButton>
        </div>
        <p class="modal-note">Swapping reloads the game for everyone; phones re-skin to the new console's controller automatically.</p>
      </div>
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.lobby { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
.ticket-card { padding: 28px; }
.ticket-note { margin-top: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }
.load-card { padding: 24px; }
.load-card h2 { font-family: var(--font-display); font-weight: 800; font-size: 20px; }
.hint { color: var(--mute); font-size: 13px; margin: 2px 0 18px; }
.drop { display: block; border: var(--bd) dashed var(--line); border-radius: var(--radius); padding: 30px 16px; text-align: center; color: var(--ink-soft); cursor: pointer; transition: border-color 0.16s, background 0.16s; }
.drop.hot { border-color: var(--primary); background: var(--surface-2); color: var(--ink); }
/* A ROM is loaded: solid border + tint so the loaded state reads at a glance. */
.drop.loaded { border-style: solid; border-color: var(--c4); background: var(--surface-2); }
.drop strong { color: var(--ink); font-weight: 800; }
.drop small { display: block; margin-top: 8px; font-size: 11px; font-family: var(--font-mono); color: var(--mute); }
.drop-badge { display: inline-block; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--primary-ink); background: var(--c4); border-radius: 999px; padding: 3px 10px; margin-bottom: 8px; }
.rom-name { display: block; font-size: 17px; word-break: break-all; }
.row { display: flex; gap: 10px; margin-top: 16px; }
.row.tight { margin-top: 8px; }
.field { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.field.sysf { flex: 0 0 180px; }
.flbl { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mute); }
input[type='text'], select { font-family: var(--font-mono); font-size: 13px; color: var(--ink); background: var(--surface); border: var(--bd) solid var(--line); border-radius: calc(var(--radius) - 4px); padding: 11px 12px; width: 100%; }
.detected { margin-top: 12px; font-size: 13px; color: var(--ink-soft); }
.lobby-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }

.live { flex: 1; display: flex; flex-direction: column; gap: 16px; }

/* Screen (with a seat strip under it) sits beside a lean join card. The screen
   carries its own resizable width; the card is a fixed compact column. They wrap
   (card drops below) only once the screen is grown past the room beside it. */
.top { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
/* The screen grows to fill the row up to the dragged size, but SHRINKS to keep the
   join card beside it (the screen scales down proportionally via its aspect ratio),
   wrapping the card below only once the screen would be smaller than its min. */
.screen-col { flex: 1 1 320px; min-width: 320px; max-width: var(--screen-w, 720px); display: flex; flex-direction: column; gap: 10px; }
.screen-wrap { position: relative; width: 100%; }
.screen { width: 100%; aspect-ratio: 4 / 3; background: #000; border: var(--bd) solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.resize-h { position: absolute; right: -6px; bottom: -6px; width: 26px; height: 26px; cursor: nwse-resize; touch-action: none; border-radius: 0 0 8px 0; border-right: 4px solid var(--primary); border-bottom: 4px solid var(--primary); opacity: 0.7; }
.resize-h:hover { opacity: 1; }

/* Compact controller-seat strip directly under the screen. */
.seatbar { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; }
.chip { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 7px 10px; border: var(--bd) solid var(--line); border-radius: calc(var(--radius) - 6px); background: var(--surface); }
.chip.on { background: var(--surface-2); border-color: var(--primary); }
.cp { font-family: var(--font-display); font-weight: 800; color: var(--mute); font-size: 12px; flex: none; }
.chip.on .cp { color: var(--primary); }
.cn { font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pad-tag { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: var(--primary-ink); background: var(--c4); border-radius: 4px; padding: 1px 5px; flex: none; }

/* Lean join card */
.join { flex: 0 0 260px; min-width: 220px; max-width: 300px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px; border: var(--bd) solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm); }
.join-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.join-lbl { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mute); }
.big-code { font-family: var(--font-display); font-weight: 800; font-size: clamp(34px, 4vw, 46px); letter-spacing: 0.14em; color: var(--ink); line-height: 1; }
.join-url { font-size: 11px; color: var(--mute); word-break: break-all; text-align: center; }
.join-count { font-size: 13px; color: var(--ink-soft); }
.join-count b { color: var(--primary); font-weight: 800; }
.watching { color: var(--c5); font-weight: 700; }
.join-btns { width: 100%; display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
.watch-note { font-size: 10px; color: var(--mute); text-align: center; }

/* Swap modal (keeps the live view uncluttered) */
/* Above the EmulatorJS menu bar, which mounts its own high-z chrome. */
.modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in srgb, var(--ink) 36%, transparent); }
.modal-card { width: min(520px, 100%); max-height: 90vh; overflow: auto; padding: 22px; border: var(--bd) solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
.modal-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.modal-h h3 { font-family: var(--font-display); font-weight: 800; font-size: 18px; }
.x { width: 34px; height: 34px; border-radius: 50%; border: var(--bd) solid var(--line); background: var(--surface); color: var(--ink); font-size: 20px; line-height: 1; cursor: pointer; }
.modal-now { font-size: 13px; color: var(--ink-soft); margin-bottom: 16px; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.modal-note { margin-top: 12px; font-size: 12px; color: var(--mute); line-height: 1.45; }
.swap-sys { font-size: 13px; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--primary); color: var(--primary-ink); border-radius: 999px; padding: 9px 18px; font-weight: 800; font-size: 13px; box-shadow: var(--shadow-sm); z-index: 10000; }
@media (max-width: 900px) { .lobby { grid-template-columns: 1fr; } }
</style>
