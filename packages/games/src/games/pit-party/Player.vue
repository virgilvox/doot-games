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
import { drawCart } from './carts/preview'
import { drawPortrait } from './characters/portraits'
import { itemName, itemSvg } from './items-art'
import { ord } from './logic'
import { CH, type Phase, type RosterMsg, type SeatMsg, type TeleMsg } from './protocol'
import { resolveKart, statBars } from './roster'
import { createViewer, webrtcSupported } from './stream'

type Scheme = 'auto' | 'joystick' | 'wheel'
const SCHEME_KEY = 'pit_party_scheme'

const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

// shared state from the host
const phase = ref<Phase>('lobby')
const seat = ref(-1)
/** True once the host has sent ANY seat message (distinguishes "grid full" from
 *  "joined mid-race, not seated yet"). */
const gotSeat = ref(false)
const tele = ref<TeleMsg | null>(null)
const charId = ref('socket')
const cartId = ref('standard')
const ready = ref(false)
const scheme = ref<Scheme>((typeof localStorage !== 'undefined' && (localStorage.getItem(SCHEME_KEY) as Scheme)) || 'joystick')
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

// drivers already claimed by ANOTHER seat are greyed out (first come, first served)
const rosterByPid = ref<Record<string, string>>({})
function takenByOther(id: string): boolean {
  for (const [pid, ch] of Object.entries(rosterByPid.value)) {
    if (ch === id && pid !== myId.value) return true
  }
  return false
}

function pickChar(id: string): void {
  if (takenByOther(id)) return
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

let goTimer = 0
watch(tele, (v) => {
  if (!v) return
  if (v.c !== prevCount) {
    countNum.value = v.c
    if (v.c >= 1) vibrate(15)
    else if (v.c === 0) {
      vibrate(60)
      // belt-and-suspenders: clear GO after a beat even if telemetry keeps sending 0
      clearTimeout(goTimer)
      goTimer = window.setTimeout(() => {
        if (countNum.value === 0) countNum.value = -1
      }, 1000)
    }
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

const heldSvg = computed(() => itemSvg(tele.value?.i ?? ''))
const heldName = computed(() => itemName(tele.value?.i ?? ''))

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
      gotSeat.value = true
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
  unsubs.push(
    room.onExtra(CH.roster, (v) => {
      const m = v as Partial<RosterMsg> | null
      if (!m?.byPid) return
      rosterByPid.value = m.byPid
      // someone else already holds my (e.g. restored) pick: bump to a free driver
      if ((phase.value === 'lobby' || phase.value === 'select') && takenByOther(charId.value)) {
        const free = CHARACTERS.find((c) => !takenByOther(c.id))
        if (free) {
          charId.value = free.id
          publishPick()
        }
      }
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
const cartCanvases = new Map<string, HTMLCanvasElement>()
function cartRef(el: Element | null, id: string): void {
  if (!(el instanceof HTMLCanvasElement)) return
  cartCanvases.set(id, el)
  const r = resolveKart(charId.value, id)
  drawCart(el, id, r.paint, r.accent)
}
// repaint every cart preview in the driver's colours when the driver changes
watch(charId, () => {
  for (const [id, el] of cartCanvases) {
    const r = resolveKart(charId.value, id)
    drawCart(el, id, r.paint, r.accent)
  }
})
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
            :class="{ sel: charId === c.id, taken: takenByOther(c.id) }"
            @click="pickChar(c.id)"
          >
            <canvas :ref="(el) => portraitRef(el as Element, c.id)" width="56" height="56" />
            <span class="cn" :style="{ color: '#' + c.paint.toString(16).padStart(6, '0') }">{{ c.name }}</span>
            <span v-if="takenByOther(c.id)" class="tk">TAKEN</span>
          </button>
        </div>
      </div>
      <div class="grp">
        <div class="label">kart</div>
        <div class="kgrid">
          <button v-for="c in CARTS" :key="c.id" class="ktile" :class="{ sel: cartId === c.id }" @click="pickCart(c.id)">
            <canvas :ref="(el) => cartRef(el as Element, c.id)" class="kcv" width="112" height="64" />
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
      <header class="strip">
        <span class="rank">{{ tele?.r ? ord(tele.r) : '--' }}</span>
        <div class="meta">
          <span class="lap">{{ tele?.p ? 'FINISHED ' + ord(tele.p) : 'LAP ' + (tele?.l ?? 1) + ' / ' + (tele?.L ?? 3) }}</span>
          <span class="spd">{{ tele?.s ?? 0 }}<i>KPH</i></span>
        </div>
        <span class="itm" :class="{ has: !!tele?.i }" :title="heldName" v-html="heldSvg" />
        <div class="seg">
          <button :class="{ on: scheme === 'joystick' }" @click="scheme = 'joystick'">STICK</button>
          <button :class="{ on: scheme === 'wheel' }" @click="scheme = 'wheel'">WHEEL</button>
          <button :class="{ on: scheme === 'auto' }" @click="scheme = 'auto'">AUTO</button>
        </div>
        <button v-if="canWatch" class="watch" :class="{ on: watching }" @click="toggleWatch">{{ watching ? 'LIVE' : 'WATCH' }}</button>
      </header>

      <div class="deck">
        <div class="ctrlZone">
          <Thumbstick v-if="scheme === 'joystick'" side="left" :deadzone="0.08" @axis="onStick" />
          <SteeringWheel v-else @steer="onSteer" />
          <span class="hint">{{ scheme === 'joystick' ? 'PUSH UP TO GO' : scheme === 'auto' ? 'DRAG TO STEER' : 'STEER' }}</span>
        </div>
        <div class="actions" :class="scheme">
          <div class="cell item"><PadButton id="item" label="ITEM" hue="primary" shape="square" @input="(e) => e.pressed && fireItem()" /></div>
          <div class="cell drift"><PadButton id="drift" label="DRIFT" hue="c1" shape="square" @input="holdDrift" /></div>
          <div v-if="scheme !== 'joystick'" class="cell brake"><PadButton id="brake" label="BRAKE" hue="c2" shape="square" @input="holdBrake" /></div>
          <div v-if="scheme === 'wheel'" class="cell gas"><PadButton id="gas" label="GAS" hue="c3" shape="square" @input="holdGas" /></div>
        </div>
      </div>

      <div v-if="countNum >= 1" class="cdo"><span class="num">{{ countNum }}</span></div>
      <div v-else-if="countNum === 0" class="cdo"><span class="num go">GO</span></div>
      <div v-if="finishBanner" class="banner">{{ finishBanner }}</div>
    </section>

    <!-- SPECTATE -->
    <section v-else-if="screen === 'spectate'" class="spectate">
      <video v-if="watching" ref="videoEl" class="streamFull" autoplay playsinline muted />
      <div v-else class="spectatemsg">
        <div class="big-t">{{ gotSeat ? 'GRID IS FULL' : 'RACE IN PROGRESS' }}</div>
        <p>{{ gotSeat ? "Four drivers are racing this round. You're up next race." : "You're in. You'll get a seat when this race wraps up." }}</p>
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
  /* Drive the @doot-games/ui controller kit (Thumbstick / PadButton / SteeringWheel)
     in the KERF pit-lane palette so the controls match this game's chrome. */
  --surface: #1f1c27;
  --surface-2: #14121a;
  --line: #0b0a0f;
  --bd: 3px;
  --shadow-sm: 2px 2px 0 var(--ink);
  --primary: #ffd23f;
  --c1: #ff5d8f;
  --c2: #ff4d5e;
  --c3: #5fe08a;
  --c4: #4ec3e0;
  --c5: #b48ae0;
  --control-scale: 1.1;
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
.ctile.taken {
  opacity: 0.45;
  cursor: default;
  position: relative;
}
.ctile .tk {
  position: absolute;
  top: 4px;
  right: 4px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.08em;
  background: var(--flag-red);
  color: var(--ink);
  padding: 1px 4px;
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
.ktile .kcv {
  width: 100%;
  height: auto;
  max-height: 48px;
  object-fit: contain;
  margin-bottom: 2px;
  image-rendering: auto;
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
  font-size: 26px;
  color: var(--hivis);
  text-shadow: 2px 2px 0 var(--ink);
  min-width: 50px;
}
.strip .meta {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.strip .lap {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--smoke);
  text-transform: uppercase;
  white-space: nowrap;
}
.strip .spd {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--chalk);
}
.strip .spd i {
  font-family: var(--font-mono);
  font-size: 9px;
  font-style: normal;
  color: var(--ghost);
  margin-left: 3px;
}
.strip .itm {
  width: 40px;
  height: 40px;
  border: 2px solid var(--pitline);
  border-radius: 9px;
  background: var(--tarmac);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
}
.strip .itm.has {
  border-color: var(--hivis);
  box-shadow: 0 0 12px rgba(255, 210, 63, 0.4);
}
.strip .itm :deep(svg) {
  width: 26px;
  height: 26px;
}
.seg {
  display: flex;
  border: 2px solid var(--ink);
  border-radius: 9px;
  overflow: hidden;
}
.seg button {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 10px 9px;
  background: var(--tarmac);
  color: var(--smoke);
  border: 0;
  border-right: 2px solid var(--ink);
  cursor: pointer;
}
.seg button:last-child {
  border-right: 0;
}
.seg button.on {
  background: var(--hivis);
  color: var(--ink);
}
.watch {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  padding: 10px 11px;
  background: var(--tarmac);
  color: var(--smoke);
  border: 2px solid var(--pitline);
  border-radius: 9px;
  cursor: pointer;
}
.watch.on {
  background: var(--flag-green);
  color: var(--ink);
  border-color: var(--ink);
}
.deck {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: stretch;
  min-height: 0;
  touch-action: none;
  padding: 14px;
  gap: 14px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
}
.ctrlZone {
  flex: 1.2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: radial-gradient(circle at 50% 56%, rgba(255, 210, 63, 0.06), transparent 64%);
  border-radius: 16px;
}
.hint {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--ghost);
  text-transform: uppercase;
}
.actions {
  flex: 1;
  display: grid;
  gap: 12px;
}
.actions .cell {
  display: grid;
  min-height: 0;
  min-width: 0;
}
.actions :deep(.pad-btn) {
  width: 100%;
  height: 100%;
  min-height: 0;
  font-size: clamp(14px, 4.2vmin, 22px);
}
.actions.joystick {
  grid-template-rows: 1fr 1.35fr;
}
.actions.auto {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1.3fr 1fr;
  grid-template-areas: 'drift drift' 'item brake';
}
.actions.auto .drift {
  grid-area: drift;
}
.actions.auto .item {
  grid-area: item;
}
.actions.auto .brake {
  grid-area: brake;
}
.actions.wheel {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1.3fr;
  grid-template-areas: 'item drift' 'brake gas';
}
.actions.wheel .item {
  grid-area: item;
}
.actions.wheel .drift {
  grid-area: drift;
}
.actions.wheel .brake {
  grid-area: brake;
}
.actions.wheel .gas {
  grid-area: gas;
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
