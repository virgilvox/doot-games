<script setup lang="ts">
/**
 * Pit Party phone controller. The player already joined the Doot room, so this is
 * just: pick a driver + kart (the selection screen), then drive. Input rides the
 * relay's `/x/in/<pid>` channel; telemetry comes back on `/x/tele/<pid>`.
 *
 * Three control schemes, because touch racing has no single standard: Auto-drive
 * (auto-accelerate, just steer + drift + item - the casual mobile-kart default,
 * frees both thumbs), Joystick (left stick steers + push-up accelerates / pull-down
 * brakes, right thumb drifts/items), and Wheel + pedals (the classic). All map to
 * the same {steer, gas, brake, drift}. Optionally watch the big-screen stream behind
 * the controls.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { PadButton, SteeringWheel, Thumbstick } from '@doot-games/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CARTS } from './carts'
import { CHARACTERS } from './characters'
import { drawPortrait } from './characters/portraits'
import { ord } from './logic'
import { CH, type Phase, type SeatMsg, type TeleMsg } from './protocol'
import { resolveKart, statBars } from './roster'
import { createViewer, webrtcSupported } from './stream'

type Scheme = 'auto' | 'joystick' | 'wheel'
const SCHEME_KEY = 'pit_party_scheme'

const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

// shared state from the host
const phase = ref<Phase>('lobby')
const seat = ref(-1)
const tele = ref<TeleMsg | null>(null)
const charId = ref('socket')
const cartId = ref('standard')
const ready = ref(false)
const scheme = ref<Scheme>((typeof localStorage !== 'undefined' && (localStorage.getItem(SCHEME_KEY) as Scheme)) || 'auto')
watch(scheme, (s) => {
  try {
    localStorage.setItem(SCHEME_KEY, s)
  } catch {
    /* private mode */
  }
})

const screen = computed<'select' | 'drive' | 'spectate' | 'result'>(() => {
  if (phase.value === 'finish') return 'result'
  if (phase.value === 'count' || phase.value === 'race') return seat.value >= 0 ? 'drive' : 'spectate'
  return seat.value >= 0 || phase.value === 'lobby' || phase.value === 'select' ? 'select' : 'spectate'
})

// controller input
const steer = ref(0)
const stickX = ref(0)
const stickY = ref(0)
const gasBtn = ref(false)
const brakeBtn = ref(false)
const driftBtn = ref(false)

const out = computed(() => {
  let s = steer.value
  let g = 0
  let b = 0
  let d = driftBtn.value ? 1 : 0
  if (scheme.value === 'auto') {
    s = steer.value
    g = brakeBtn.value ? 0 : 1
    b = brakeBtn.value ? 1 : 0
  } else if (scheme.value === 'joystick') {
    s = stickX.value
    g = stickY.value > 0.15 ? 1 : 0
    b = stickY.value < -0.15 ? 1 : 0
  } else {
    s = steer.value
    g = gasBtn.value ? 1 : 0
    b = brakeBtn.value ? 1 : 0
  }
  return { s: Math.round(s * 100) / 100, g, b, d }
})

let inputTimer = 0
function sendInput(): void {
  if (seat.value < 0) return
  room.publishExtra(CH.input(myId.value), out.value)
}
function fireItem(): void {
  if (seat.value < 0) return
  room.publishExtra(CH.item(myId.value), { t: Date.now() })
  vibrate(20)
}

function onSteer(v: number): void {
  steer.value = v
}
function onStick(e: { x: number; y: number }): void {
  stickX.value = e.x
  stickY.value = e.y
}
function holdGas(e: { pressed: boolean }): void {
  gasBtn.value = e.pressed
}
function holdBrake(e: { pressed: boolean }): void {
  brakeBtn.value = e.pressed
}
function holdDrift(e: { pressed: boolean }): void {
  driftBtn.value = e.pressed
}

function vibrate(p: number | number[]): void {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* unsupported */
  }
}

// selection
const resolved = computed(() => resolveKart(charId.value, cartId.value))
const bars = computed(() => statBars(resolved.value.stats))

function pickChar(id: string): void {
  charId.value = id
  publishPick()
}
function pickCart(id: string): void {
  cartId.value = id
  publishPick()
}
function toggleReady(): void {
  ready.value = !ready.value
  publishPick()
  vibrate(15)
}
function publishPick(): void {
  room.publishExtra(CH.pick(myId.value), { charId: charId.value, cartId: cartId.value, ready: ready.value })
}

// telemetry / countdown / finish feedback
let prevCount = -1
let prevPlace = 0
let prevEv = { hit: 0, pick: 0, boost: 0 }
const countNum = ref(-1)
const finishBanner = ref('')

watch(tele, (v) => {
  if (!v) return
  if (v.c !== prevCount) {
    countNum.value = v.c
    if (v.c >= 1) vibrate(15)
    else if (v.c === 0) vibrate(60)
    prevCount = v.c
  }
  if (v.p > 0 && prevPlace === 0) {
    finishBanner.value = `FINISHED ${ord(v.p)}`
    vibrate([90, 60, 90, 60, 180])
  }
  prevPlace = v.p
  if (v.hit > prevEv.hit) vibrate([60, 40, 60])
  else if (v.pick > prevEv.pick) vibrate(30)
  else if (v.boost > prevEv.boost) vibrate(40)
  prevEv = { hit: v.hit, pick: v.pick, boost: v.boost }
})

const itemSvg = computed(() => ITEM_SVG[tele.value?.i ?? ''] ?? '')
const ITEM_SVG: Record<string, string> = {
  boost: '<svg viewBox="0 0 24 24"><path d="M4 5l7 7-7 7V5zm9 0l7 7-7 7V5z"/></svg>',
  triple: '<svg viewBox="0 0 24 24"><path d="M2 6l5 6-5 6V6zm7 0l5 6-5 6V6zm7 0l5 6-5 6V6z"/></svg>',
  wrench:
    '<svg viewBox="0 0 24 24"><path d="M21.2 6.4a5.4 5.4 0 0 1-7 6.9L7 20.5a2.1 2.1 0 0 1-3-3l7.2-7.2a5.4 5.4 0 0 1 6.9-7l-2.9 2.9 2.3 2.3 2.7-2.6z"/></svg>',
  slick: '<svg viewBox="0 0 24 24"><path d="M12 2.6c3.1 4.6 6.2 7.8 6.2 11.3A6.2 6.2 0 0 1 12 20.1a6.2 6.2 0 0 1-6.2-6.2c0-3.5 3.1-6.7 6.2-11.3z"/></svg>',
  volt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
}

// watch stream
const canWatch = webrtcSupported()
const watching = ref(false)
const videoEl = ref<HTMLVideoElement | null>(null)
let viewer: ReturnType<typeof createViewer> | null = null
function toggleWatch(): void {
  watching.value = !watching.value
  if (watching.value) {
    requestAnimationFrame(() => {
      if (videoEl.value) viewer = createViewer(room, videoEl.value)
    })
  } else {
    viewer?.close()
    viewer = null
  }
}

// relay subscriptions
const unsubs: Array<() => void> = []
onMounted(() => {
  unsubs.push(
    room.onExtra(CH.state, (v) => {
      const m = v as { phase?: Phase } | null
      if (m?.phase) phase.value = m.phase
    }),
  )
  unsubs.push(
    room.onExtra(CH.seat(myId.value), (v) => {
      const m = v as Partial<SeatMsg> | null
      if (!m) return
      seat.value = m.seat ?? -1
      // The phone owns its selection during lobby/select; only adopt the host's
      // char/cart once they're LOCKED (in race), so a seat echo can't revert a
      // choice the player is mid-tapping.
      if (m.locked) {
        if (m.charId) charId.value = m.charId
        if (m.cartId) cartId.value = m.cartId
      }
    }),
  )
  unsubs.push(
    room.onExtra(CH.tele(myId.value), (v) => {
      tele.value = v as TeleMsg | null
    }),
  )
  // restore a saved pick + announce it
  try {
    const saved = JSON.parse(localStorage.getItem('pit_party_pick') || 'null')
    if (saved?.charId) charId.value = saved.charId
    if (saved?.cartId) cartId.value = saved.cartId
  } catch {
    /* ignore */
  }
  publishPick()
  inputTimer = window.setInterval(sendInput, 33)
})

watch([charId, cartId], () => {
  try {
    localStorage.setItem('pit_party_pick', JSON.stringify({ charId: charId.value, cartId: cartId.value }))
  } catch {
    /* ignore */
  }
})

onBeforeUnmount(() => {
  clearInterval(inputTimer)
  for (const u of unsubs) u()
  viewer?.close()
})

function portraitRef(el: Element | null, id: string): void {
  if (el instanceof HTMLCanvasElement) drawPortrait(el, id)
}
</script>

<template>
  <div class="pit-pad">
    <!-- SELECT -->
    <section v-if="screen === 'select'" class="select">
      <header class="selhead">
        <h1>PIT PARTY</h1>
        <span class="tag">pick a driver + a kart</span>
      </header>
      <div class="grp">
        <div class="label">driver</div>
        <div class="cgrid">
          <button
            v-for="c in CHARACTERS"
            :key="c.id"
            class="ctile"
            :class="{ sel: charId === c.id }"
            @click="pickChar(c.id)"
          >
            <canvas :ref="(el) => portraitRef(el as Element, c.id)" width="56" height="56" />
            <span class="cn" :style="{ color: '#' + c.paint.toString(16).padStart(6, '0') }">{{ c.name }}</span>
          </button>
        </div>
      </div>
      <div class="grp">
        <div class="label">kart</div>
        <div class="kgrid">
          <button v-for="c in CARTS" :key="c.id" class="ktile" :class="{ sel: cartId === c.id }" @click="pickCart(c.id)">
            <span class="kn">{{ c.name }}</span>
            <span class="kb">{{ c.blurb }}</span>
          </button>
        </div>
      </div>
      <div class="stats">
        <div v-for="b in bars" :key="b.label" class="statrow">
          <span class="sl">{{ b.label }}</span>
          <span class="bar"><i :style="{ width: b.value * 100 + '%' }" /></span>
        </div>
      </div>
      <button class="big" :class="{ on: ready }" @click="toggleReady">{{ ready ? "READY. WAITING FOR THE GUN" : "I'M READY" }}</button>
    </section>

    <!-- DRIVE -->
    <section v-else-if="screen === 'drive'" class="drive">
      <video v-if="watching" ref="videoEl" class="streamBg" autoplay playsinline muted />
      <div class="strip">
        <span class="rank">{{ tele?.r ? ord(tele.r) : '--' }}</span>
        <span class="lap">{{ tele?.p ? 'FIN ' + ord(tele.p) : 'LAP ' + (tele?.l ?? 1) + '/' + (tele?.L ?? 3) }}</span>
        <span class="itm" :class="{ has: !!tele?.i }" v-html="itemSvg" />
        <span class="spd">{{ tele?.s ?? 0 }} KPH</span>
        <button v-if="canWatch" class="mini" :class="{ on: watching }" @click="toggleWatch">{{ watching ? 'WATCHING' : 'WATCH' }}</button>
        <select v-model="scheme" class="schemesel" aria-label="Control scheme">
          <option value="auto">AUTO</option>
          <option value="joystick">STICK</option>
          <option value="wheel">WHEEL</option>
        </select>
      </div>

      <div class="deck">
        <!-- AUTO: wheel + drift/item (+ brake) -->
        <template v-if="scheme === 'auto'">
          <div class="steerZone">
            <SteeringWheel @steer="onSteer" />
            <span class="hint">drag to steer · auto-gas</span>
          </div>
          <div class="btnCol auto">
            <PadButton id="item" label="ITEM" hue="primary" shape="square" @input="(e) => e.pressed && fireItem()" />
            <PadButton id="drift" label="DRIFT" hue="c1" @input="holdDrift" />
            <PadButton id="brake" label="BRAKE" hue="c2" @input="holdBrake" />
          </div>
        </template>

        <!-- JOYSTICK: stick (steer+gas) + drift/item -->
        <template v-else-if="scheme === 'joystick'">
          <div class="steerZone">
            <Thumbstick side="left" @axis="onStick" />
            <span class="hint">push up to go · steer left/right</span>
          </div>
          <div class="btnCol">
            <PadButton id="item" label="ITEM" hue="primary" shape="square" @input="(e) => e.pressed && fireItem()" />
            <PadButton id="drift" label="DRIFT" hue="c1" @input="holdDrift" />
          </div>
        </template>

        <!-- WHEEL: wheel + gas/brake/drift/item -->
        <template v-else>
          <div class="steerZone">
            <SteeringWheel @steer="onSteer" />
          </div>
          <div class="btnCol wheel">
            <PadButton id="item" label="ITEM" hue="primary" shape="square" @input="(e) => e.pressed && fireItem()" />
            <PadButton id="drift" label="DRIFT" hue="c1" @input="holdDrift" />
            <PadButton id="brake" label="BRAKE" hue="c2" @input="holdBrake" />
            <PadButton id="gas" label="GAS" hue="primary" @input="holdGas" />
          </div>
        </template>
      </div>

      <div v-if="countNum >= 1" class="cdo"><span class="num">{{ countNum }}</span></div>
      <div v-else-if="countNum === 0" class="cdo"><span class="num go">GO</span></div>
      <div v-if="finishBanner" class="banner">{{ finishBanner }}</div>
    </section>

    <!-- SPECTATE -->
    <section v-else-if="screen === 'spectate'" class="spectate">
      <video v-if="watching" ref="videoEl" class="streamFull" autoplay playsinline muted />
      <div v-else class="spectatemsg">
        <div class="big-t">GRID IS FULL</div>
        <p>Four drivers are racing this round. You're up next race.</p>
        <button v-if="canWatch" class="big" @click="toggleWatch">WATCH THE RACE</button>
      </div>
    </section>

    <!-- RESULT -->
    <section v-else class="result">
      <div class="big-t">{{ tele?.p ? 'YOU FINISHED ' + ord(tele.p) : 'RACE OVER' }}</div>
      <p>Check the big screen for the standings. Re-pick for the next race.</p>
      <button class="big" @click="phase = 'select'">CHANGE RIDE</button>
    </section>
  </div>
</template>

<style scoped>
.pit-pad {
  --tarmac: #15131a;
  --pit: #1f1c27;
  --pitline: #332e40;
  --ink: #0b0a0f;
  --chalk: #f0ecdf;
  --smoke: #9d96ad;
  --ghost: #5d5670;
  --hivis: #ffd23f;
  --flag-red: #ff4d5e;
  --flag-green: #5fe08a;
  --font-display: 'Bungee', system-ui, sans-serif;
  --font-ui: 'Chakra Petch', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --shadow: 4px 4px 0 var(--ink);
  position: absolute;
  inset: 0;
  background: var(--tarmac);
  color: var(--chalk);
  font-family: var(--font-ui);
  overflow: hidden;
  user-select: none;
}
.label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ghost);
}
.big {
  width: 100%;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--hivis);
  border: 3px solid var(--ink);
  box-shadow: var(--shadow);
  padding: 14px;
  cursor: pointer;
}
.big.on {
  background: var(--flag-green);
}
.big:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
/* select */
.select {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
}
.selhead h1 {
  font-family: var(--font-display);
  font-size: 36px;
  color: var(--hivis);
  text-shadow: 3px 3px 0 var(--ink);
}
.tag {
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--smoke);
  font-size: 11px;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cgrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.ctile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--tarmac);
  border: 3px solid var(--pitline);
  padding: 8px 4px;
  cursor: pointer;
}
.ctile canvas {
  width: 52px;
  height: 52px;
  image-rendering: pixelated;
}
.ctile .cn {
  font-weight: 700;
  font-size: 11px;
}
.ctile.sel {
  border-color: var(--hivis);
  box-shadow: var(--shadow);
}
.kgrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.ktile {
  display: flex;
  flex-direction: column;
  background: var(--tarmac);
  border: 3px solid var(--pitline);
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}
.ktile .kn {
  font-weight: 700;
  font-size: 13px;
  color: var(--chalk);
}
.ktile .kb {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ghost);
  text-transform: uppercase;
}
.ktile.sel {
  border-color: var(--hivis);
  box-shadow: var(--shadow);
}
.stats {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: var(--pit);
  border: 2px solid var(--pitline);
  padding: 10px;
}
.statrow {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 8px;
  align-items: center;
}
.statrow .sl {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--smoke);
}
.statrow .bar {
  height: 8px;
  border: 2px solid var(--ink);
  background: var(--tarmac);
}
.statrow .bar i {
  display: block;
  height: 100%;
  background: var(--hivis);
}
/* drive */
.drive {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  touch-action: none;
}
.streamBg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.85;
  z-index: 0;
}
.strip {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--pit);
  border-bottom: 3px solid var(--ink);
  min-height: 48px;
  padding-top: max(6px, env(safe-area-inset-top));
}
.strip .rank {
  font-family: var(--font-display);
  font-size: 24px;
  color: var(--hivis);
  text-shadow: 2px 2px 0 var(--ink);
  min-width: 54px;
}
.strip .lap {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--smoke);
}
.strip .itm {
  width: 32px;
  height: 32px;
  border: 2px solid var(--pitline);
  display: flex;
  align-items: center;
  justify-content: center;
}
.strip .itm.has {
  border-color: var(--hivis);
}
.strip .itm :deep(svg) {
  width: 22px;
  height: 22px;
  fill: var(--hivis);
}
.strip .spd {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--smoke);
  margin-left: auto;
}
.strip .mini,
.strip .schemesel {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--tarmac);
  color: var(--smoke);
  border: 2px solid var(--pitline);
  padding: 8px 10px;
}
.strip .mini.on {
  background: var(--hivis);
  color: var(--ink);
  border-color: var(--ink);
}
.deck {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  min-height: 0;
  touch-action: none;
}
.steerZone {
  flex: 1.15;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-right: 3px solid var(--ink);
  background: radial-gradient(circle at 50% 58%, rgba(255, 210, 63, 0.05), transparent 62%), transparent;
}
.hint {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ghost);
  text-transform: uppercase;
}
.btnCol {
  flex: 1;
  display: grid;
  gap: 10px;
  padding: 12px;
  grid-template-columns: 1fr 1fr;
}
.btnCol :deep(.pad-btn) {
  width: 100%;
  height: 100%;
}
.btnCol.auto {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1.4fr;
  grid-template-areas: 'item drift' 'brake brake';
}
.btnCol.auto :deep(.pad-btn) {
  height: 100%;
}
.btnCol.wheel {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1.4fr;
  grid-template-areas: 'item drift' 'brake gas';
}
.cdo {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(11, 10, 15, 0.35);
}
.cdo .num {
  font-family: var(--font-display);
  font-size: 30vmin;
  color: var(--hivis);
  text-shadow: 8px 8px 0 var(--ink);
}
.cdo .num.go {
  color: var(--flag-green);
}
.banner {
  position: absolute;
  left: 50%;
  top: 16%;
  transform: translateX(-50%);
  z-index: 6;
  font-family: var(--font-display);
  font-size: 8vmin;
  color: var(--hivis);
  text-shadow: 5px 5px 0 var(--ink);
  background: rgba(11, 10, 15, 0.5);
  padding: 8px 22px;
  border: 3px solid var(--ink);
  pointer-events: none;
}
/* spectate / result */
.spectate,
.result {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 24px;
}
.streamFull {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.spectatemsg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.big-t {
  font-family: var(--font-display);
  font-size: 30px;
  color: var(--hivis);
  text-shadow: 3px 3px 0 var(--ink);
}
.result p,
.spectate p {
  color: var(--smoke);
  font-size: 14px;
  max-width: 30ch;
}
</style>
