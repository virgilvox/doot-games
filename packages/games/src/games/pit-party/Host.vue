<script setup lang="ts">
/**
 * Pit Party host: the big screen. Owns the authoritative race sim, mounts the
 * Three.js renderer, runs the fixed-step loop, drives the lobby -> select -> count
 * -> race -> results -> Grand Prix flow, and bridges the phone controllers over the
 * relay's `/x/` channels. Phones are wheels; the big screen shows split-screen for
 * up to four human drivers, with CPUs filling the grid. Remote folks watch via the
 * WebRTC spectator stream. Keeps the KERF "night pit-lane" look.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { QrCode } from '@doot-games/ui'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { CART_IDS, getCart } from './carts'
import { CHARACTER_IDS, getCharacter } from './characters'
import { drawPortrait } from './characters/portraits'
import { PitAudio } from './engine/audio'
import { PitEngine, type PaneView } from './engine/scene'
import { itemSvg } from './items-art'
import { fmtTime, kph, ord } from './logic'
import { MAPS, bakeMap, getMap } from './maps'
import { CH, type InputMsg, type PickMsg, type Phase, pidOf } from './protocol'
import { resolveKart } from './roster'
import { Race } from './sim/race'
import type { RaceEvent } from './sim/types'
import { type CupStanding, pointsForPlace, tallyCup } from './sim/standings'
import { serveStream, webrtcSupported } from './stream'

const TOTAL_RACERS = 8
const MAX_DRIVERS = 4 // split-screen cap

const room = injectDootRoom()
const code = computed(() => room.code.value)
const joinUrl = computed(() =>
  typeof window === 'undefined' ? `/play/${code.value}` : `${window.location.origin}/play/${code.value}`,
)
const copied = ref(false)
function copyLink(): void {
  navigator.clipboard
    ?.writeText(joinUrl.value)
    .then(() => {
      copied.value = true
      window.setTimeout(() => (copied.value = false), 1600)
    })
    .catch(() => {})
}

const stageRef = ref<HTMLDivElement>()
const miniRef = ref<HTMLCanvasElement>()

let engine: PitEngine | null = null
const audio = new PitAudio()
let race: Race | null = null
let stream: ReturnType<typeof serveStream> | null = null

// host-side driver model
interface Driver {
  id: string // kart id (= player id for a phone, 'kb' for the keyboard)
  pid: string | null
  name: string
  charId: string
  cartId: string
  ready: boolean
  seat: number
  input: InputMsg
  itemQueued: boolean
  /** Last item-fire timestamp seen, so a retained replay can't re-fire (rising edge). */
  lastItemT: number
  ev: { hit: number; pick: number; boost: number }
  lastSeen: number
  /** True while a PAD driver's signal is lost and its kart is on autopilot. */
  lost: boolean
  source: 'PAD' | 'KEYS'
}
const drivers = reactive<Driver[]>([])
const phase = ref<Phase>('lobby')
const mapId = ref('kiln')
const laps = ref(3)
const cupRaces = ref(1)
const raceNum = ref(1)
const cup = ref<CupStanding[]>([])
const countNum = ref(3)
const viewerCount = ref(0)

const seated = computed(() => drivers.filter((d) => d.seat >= 0))
const courseName = computed(() => getMap(mapId.value).name)
const nextCourseName = computed(() => {
  const i = MAPS.findIndex((m) => m.id === mapId.value)
  return getMap(MAPS[(i + 1) % MAPS.length]!.id).name
})

// lobby / settings
function selectCourse(id: string): void {
  if (phase.value !== 'lobby') return
  mapId.value = id
  // rebuild the cinematic preview behind the lobby so it shows the chosen course
  engine?.loadMap(bakeMap(id, code.value), getMap(id))
}
function cycleLaps(): void {
  laps.value = laps.value === 2 ? 3 : laps.value === 3 ? 5 : 2
}
function cycleCup(): void {
  cupRaces.value = cupRaces.value === 1 ? 3 : cupRaces.value === 3 ? 4 : 1
}
const kbDriver = computed(() => drivers.find((d) => d.id === 'kb') ?? null)
function addKeyboardDriver(): void {
  if (drivers.some((d) => d.id === 'kb') || seated.value.length >= MAX_DRIVERS) return
  drivers.push(makeDriver('kb', null, 'YOU (KEYS)', 'KEYS'))
  reseat()
}
function cycleKbChar(dir: number): void {
  const d = kbDriver.value
  if (!d) return
  const taken = new Set(drivers.filter((x) => x !== d).map((x) => x.charId))
  let i = CHARACTER_IDS.indexOf(d.charId)
  for (let step = 0; step < CHARACTER_IDS.length; step++) {
    i = (i + dir + CHARACTER_IDS.length) % CHARACTER_IDS.length
    if (!taken.has(CHARACTER_IDS[i]!)) break
  }
  d.charId = CHARACTER_IDS[i]!
}
function cycleKbCart(dir: number): void {
  const d = kbDriver.value
  if (!d) return
  const i = CART_IDS.indexOf(d.cartId)
  d.cartId = CART_IDS[(i + dir + CART_IDS.length) % CART_IDS.length]!
}

function makeDriver(id: string, pid: string | null, name: string, source: 'PAD' | 'KEYS'): Driver {
  // pick a default character not already chosen
  const taken = new Set(drivers.map((d) => d.charId))
  const free = getCharacter(CHARACTER_IDS.find((c) => !taken.has(c)) ?? CHARACTER_IDS[0]!)
  return {
    id,
    pid,
    name,
    charId: free.id,
    cartId: 'standard',
    ready: source === 'KEYS',
    seat: -1,
    input: { s: 0, g: 0, b: 0, d: 0 },
    itemQueued: false,
    lastItemT: 0,
    ev: { hit: 0, pick: 0, boost: 0 },
    lastSeen: performance.now(),
    lost: false,
    source,
  }
}

/** Reconcile the phone players (room.players) into the driver list + seats. */
function syncDrivers(): void {
  const players = room.players.value
  const seen = new Set<string>()
  for (const p of players) {
    seen.add(p.id)
    let d = drivers.find((x) => x.id === p.id)
    if (!d) {
      if (drivers.length - drivers.filter((x) => x.source === 'KEYS').length >= TOTAL_RACERS) continue
      d = makeDriver(p.id, p.id, p.name.toUpperCase(), 'PAD')
      drivers.push(d)
    } else {
      d.name = p.name.toUpperCase()
    }
  }
  // drop phones that left (keep the keyboard driver)
  for (let i = drivers.length - 1; i >= 0; i--) {
    const d = drivers[i]!
    if (d.source === 'PAD' && !seen.has(d.id)) drivers.splice(i, 1)
  }
  reseat()
  // Always push each driver its current seat, so a freshly-created driver (e.g. a
  // phone that just joined) gets its seat without waiting to send a pick.
  for (const d of drivers) publishSeat(d)
  publishRoster()
}

function reseat(): void {
  let s = 0
  for (const d of drivers) d.seat = s < MAX_DRIVERS ? s++ : -1
}

// CLASP host wiring
const unsubs: Array<() => void> = []
let teleT = 0
let beatT = 0

function publishState(): void {
  room.publishExtra(CH.state, {
    phase: phase.value,
    mapId: mapId.value,
    laps: laps.value,
    race: raceNum.value,
    cupRaces: cupRaces.value,
    clock: race?.raceTime ?? 0,
    count: phase.value === 'count' ? countNum.value : -1,
  })
}
function publishRoster(): void {
  const byPid: Record<string, string> = {}
  for (const d of drivers) byPid[d.id] = d.charId
  room.publishExtra(CH.roster, { takenChars: drivers.map((d) => d.charId), byPid })
}
function publishSeat(d: Driver): void {
  if (!d.pid) return
  room.publishExtra(CH.seat(d.pid), {
    seat: d.seat,
    charId: d.charId,
    cartId: d.cartId,
    paint: getCharacter(d.charId).paint,
    locked: phase.value !== 'lobby' && phase.value !== 'select',
  })
}
function publishTele(): void {
  if (!race) return
  // countdown digit during 'count'; 0 (GO) only during the brief goFlash window at
  // the gun; -1 (hidden) otherwise. Sending 0 for the whole race left the phone's GO
  // overlay stuck on.
  const c = phase.value === 'count' ? countNum.value : phase.value === 'race' && goFlash.value ? 0 : -1
  for (const d of drivers) {
    if (!d.pid) continue
    const k = race.getKart(d.id)
    if (!k) continue
    room.publishExtra(CH.tele(d.pid), {
      r: k.rank,
      l: Math.min(k.lap, laps.value),
      L: laps.value,
      s: kph(k.speed),
      i: k.item ?? '',
      c,
      p: k.place,
      st: phase.value,
      hit: k.evHit,
      pick: k.evPick,
      boost: k.evBoost,
    })
  }
}

function wireRelay(): void {
  unsubs.push(
    room.onExtra('in/*', (v, key) => {
      const d = drivers.find((x) => x.id === pidOf(key))
      if (!d || !v) return
      const m = v as Partial<InputMsg>
      d.input.s = Math.max(-1, Math.min(1, +(m.s ?? 0)))
      d.input.g = m.g ? 1 : 0
      d.input.b = m.b ? 1 : 0
      d.input.d = m.d ? 1 : 0
      d.lastSeen = performance.now()
      // reconnected mid-race: take the kart back from the autopilot CPU
      if (d.lost) {
        d.lost = false
        race?.seatHuman(d.id, d.name)
      }
    }),
  )
  unsubs.push(
    room.onExtra('item/*', (v, key) => {
      const d = drivers.find((x) => x.id === pidOf(key))
      if (!d) return
      // one-shot, rising-edge: a retained replay (e.g. host reload) must not re-fire
      const t = (v as { t?: number } | null)?.t ?? 0
      if (t > d.lastItemT) {
        d.lastItemT = t
        d.itemQueued = true
      }
    }),
  )
  unsubs.push(
    room.onExtra('pick/*', (v, key) => {
      if (!v || (phase.value !== 'lobby' && phase.value !== 'select')) return
      // The pick may arrive before the 1s roster poll created the driver; reconcile now.
      let d = drivers.find((x) => x.id === pidOf(key))
      if (!d) {
        syncDrivers()
        d = drivers.find((x) => x.id === pidOf(key))
      }
      if (!d) return
      const m = v as Partial<PickMsg>
      // first-come-first-served on drivers: ignore a pick already held by another seat
      const takenByOther = m.charId && drivers.some((x) => x !== d && x.charId === m.charId)
      if (m.charId && !takenByOther && getCharacter(m.charId).id === m.charId) d.charId = m.charId
      if (m.cartId && getCart(m.cartId).id === m.cartId) d.cartId = m.cartId
      d.ready = !!m.ready
      publishSeat(d)
      publishRoster()
    }),
  )
}

// race lifecycle
function buildRace(): void {
  const baked = bakeMap(mapId.value, `${code.value}:${raceNum.value}`)
  engine?.loadMap(baked, getMap(mapId.value))
  race = new Race(baked, { laps: laps.value, totalRacers: TOTAL_RACERS, seed: `${code.value}:${raceNum.value}` })
  let gi = 0
  const specs: Array<{ id: string; paint: number; accent: number; model: string; body: string; character: ReturnType<typeof getCharacter> }> = []
  for (const d of seated.value) {
    const r = resolveKart(d.charId, d.cartId)
    race.addKart({ id: d.id, charId: d.charId, cartId: d.cartId, name: d.name, human: true, stats: r.stats, paint: r.paint }, gi++)
    specs.push({ id: d.id, paint: r.paint, accent: r.accent, model: r.model, body: r.body, character: r.character })
    audio.engineFor(d.id)
  }
  // CPU fill: prefer characters/carts the humans didn't take (auto-includes any
  // newly-added roster member).
  const humanChars = new Set(seated.value.map((d) => d.charId))
  const freeChars = CHARACTER_IDS.filter((c) => !humanChars.has(c))
  const pool = freeChars.length ? freeChars : CHARACTER_IDS
  const carts = CART_IDS
  let ci = 0
  while (race.karts.length < TOTAL_RACERS) {
    const ch = pool[ci % pool.length]!
    const ct = carts[(ci + 1) % carts.length]!
    const r = resolveKart(ch, ct)
    const id = `cpu${ci}`
    race.addKart({ id, charId: ch, cartId: ct, name: `${getCharacter(ch).name} CPU`, human: false, stats: r.stats, paint: r.paint }, gi++)
    specs.push({ id, paint: r.paint, accent: r.accent, model: r.model, body: r.body, character: r.character })
    ci++
  }
  engine?.syncKarts(specs)
  audio.ambient(getMap(mapId.value).theme.ambient)
  rebuildPanes()
  // dev-only: expose the sim so browser smokes can assert real race state
  if ((import.meta as unknown as { dev?: boolean }).dev)
    (window as unknown as { __pitRace?: Race }).__pitRace = race
}

function startRace(): void {
  if (seated.value.length === 0) return
  arm()
  buildRace()
  race?.startCountdown()
  phase.value = 'count'
  countNum.value = 3
  for (const d of drivers) publishSeat(d)
  publishState()
}

function toSelect(): void {
  if (seated.value.length === 0) return
  arm()
  phase.value = 'select'
  for (const d of drivers) publishSeat(d)
  publishState()
}

function endToResults(): void {
  if (!race) return
  const finishes = race.results().map((k, i) => ({
    id: k.id,
    name: k.name,
    charId: k.charId,
    cartId: k.cartId,
    paint: k.paint,
    place: k.place || i + 1,
  }))
  cup.value = tallyCup(cup.value, finishes)
  phase.value = 'finish'
  for (const k of race.karts) if (k.human) audio.engineDrop(k.id)
  audio.playMusic('podium')
  audio.sfx.finish(race.karts.find((k) => k.human)?.place ?? 9)
  publishState()
  publishTele()
}

function nextRace(): void {
  if (raceNum.value < cupRaces.value) {
    raceNum.value++
    // advance to the next course in the list
    const idx = MAPS.findIndex((m) => m.id === mapId.value)
    mapId.value = MAPS[(idx + 1) % MAPS.length]!.id
  } else {
    raceNum.value = 1
  }
  startRace()
}

function backToLobby(): void {
  race = null
  phase.value = 'lobby'
  raceNum.value = 1
  cup.value = []
  audio.playMusic('menu')
  for (const d of drivers) publishSeat(d)
  publishState()
}

function rematch(): void {
  raceNum.value = 1
  cup.value = []
  startRace()
}

// split-screen layout (rects with y from the BOTTOM, for the renderer)
function layoutRects(n: number): Array<{ x: number; y: number; w: number; h: number }> {
  if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }]
  if (n === 2)
    return [
      { x: 0, y: 0.5, w: 1, h: 0.5 },
      { x: 0, y: 0, w: 1, h: 0.5 },
    ]
  if (n === 3)
    return [
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0, y: 0, w: 0.5, h: 0.5 },
    ]
  return [
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
  ]
}

interface Pane {
  id: string
  name: string
  paint: string
  left: number
  top: number
  w: number
  h: number
  place: number
  lap: string
  speed: number
  item: string
  drift: number
  driftMax: boolean
  wrong: boolean
  banner: string
}
const panes = ref<Pane[]>([])
const showMini = computed(() => phase.value === 'race' || phase.value === 'count')
const standings = ref<Array<{ rank: number; name: string; paint: string; lap: string }>>([])

function rebuildPanes(): void {
  const humans = race ? race.karts.filter((k) => k.human) : []
  const rects = layoutRects(humans.length)
  panes.value = humans.map((k, i) => {
    const r = rects[i]!
    return {
      id: k.id,
      name: k.name,
      paint: `#${k.paint.toString(16).padStart(6, '0')}`,
      left: r.x * 100,
      top: (1 - r.y - r.h) * 100,
      w: r.w * 100,
      h: r.h * 100,
      place: k.rank,
      lap: `LAP 1/${laps.value}`,
      speed: 0,
      item: '',
      drift: 0,
      driftMax: false,
      wrong: false,
      banner: '',
    }
  })
}

function paneViews(): PaneView[] {
  if (!race) return []
  const humans = race.karts.filter((k) => k.human)
  const rects = layoutRects(humans.length)
  return humans.map((k, i) => ({ kartId: k.id, rect: rects[i]! }))
}

function updateHud(): void {
  if (!race) return
  for (const p of panes.value) {
    const k = race.getKart(p.id)
    if (!k) continue
    p.place = k.rank
    p.speed = kph(k.speed)
    p.lap = k.finished ? 'DONE' : `LAP ${Math.min(k.lap, laps.value)}/${laps.value}`
    p.item = k.item ?? ''
    p.drift = k.drifting ? Math.min(1, k.driftCharge / 2.2) : 0
    p.driftMax = k.driftTier >= 2
    p.wrong = k.wrongT > 1.2 && !k.finished
  }
  const order = [...race.karts].sort((a, b) => a.rank - b.rank)
  standings.value = order.map((k) => ({
    rank: k.rank,
    name: k.name,
    paint: `#${k.paint.toString(16).padStart(6, '0')}`,
    lap: k.finished ? 'FIN' : `L${Math.min(k.lap, laps.value)}/${laps.value}`,
  }))
}

// the fixed-step loop
let raf = 0
let last = performance.now()
const keys = new Set<string>()

function pollKeyboard(): void {
  const d = drivers.find((x) => x.id === 'kb')
  if (!d) return
  const L = keys.has('a') || keys.has('arrowleft')
  const R = keys.has('d') || keys.has('arrowright')
  d.input.s = (R ? 1 : 0) - (L ? 1 : 0)
  d.input.g = keys.has('w') || keys.has('arrowup') ? 1 : 0
  d.input.b = keys.has('s') || keys.has('arrowdown') ? 1 : 0
  d.input.d = keys.has('shift') ? 1 : 0
}

function frame(t: number): void {
  raf = requestAnimationFrame(frame)
  const dt = Math.min(Math.max((t - last) / 1000, 0), 0.05)
  last = t
  let frameEvents: RaceEvent[] = []

  if (race && (phase.value === 'count' || phase.value === 'race' || phase.value === 'finish')) {
    pollKeyboard()
    // signal-loss: a phone that goes quiet mid-race hands its kart to the autopilot
    // CPU (rather than leaving it frozen driving into a wall). It comes back when
    // input resumes (see the in/* handler).
    const nowT = performance.now()
    for (const d of drivers) {
      if (d.source !== 'PAD' || d.lost) continue
      const k = race.getKart(d.id)
      if (k?.human && nowT - d.lastSeen > 2500 && phase.value !== 'finish') {
        d.lost = true
        race.handToCpu(d.id)
      }
    }
    for (const d of drivers) {
      const k = race.getKart(d.id)
      if (!k || !k.human) continue
      // The chase camera looks down +z, which mirrors world +x to screen-LEFT, so a
      // raw "steer right" turns the kart left on screen. Negate the human input so
      // left/right match the view. (AI sets k.input.steer directly and is unaffected.)
      k.input.steer = -d.input.s
      k.input.gas = d.input.g
      k.input.brake = d.input.b
      k.input.drift = d.input.d
      if (d.itemQueued) {
        k.input.itemQueued = true
        d.itemQueued = false
      }
    }
    const prevState = race.state
    race.step(dt)
    // mirror sim state into the host phase
    if (race.state === 'count') {
      countNum.value = Math.max(1, 3 - Math.floor(race.countT))
      if (phase.value !== 'count') phase.value = 'count'
    } else if (race.state === 'race' && phase.value === 'count') {
      phase.value = 'race'
      goFlash.value = true
      window.setTimeout(() => (goFlash.value = false), 900)
      audio.sfx.go()
      // race music sits under the engine drones + SFX; menu/podium can run hotter
      audio.playMusic(raceNum.value % 2 ? 'race' : 'race2', 0.26)
      publishState()
    } else if (race.state === 'finish' && phase.value !== 'finish') {
      endToResults()
    }
    if (prevState === 'count' && race.state === 'count') {
      // tick the countdown beep on each integer change
      if (countNum.value !== lastCount) {
        lastCount = countNum.value
        audio.sfx.count()
        publishState()
      }
    }

    frameEvents = race.drainEvents()
    for (const e of frameEvents) audio.onEvent(e)
    for (const d of drivers) {
      const k = race.getKart(d.id)
      if (k && k.human) audio.engineUpdate(d.id, k, race.state === 'race' || race.state === 'count')
    }
  }

  if (race) engine?.render(race, paneViews(), frameEvents, dt, t)
  else engine?.renderLobby(t)

  hudT += dt
  if (hudT > 0.08) {
    hudT = 0
    if (phase.value === 'race' || phase.value === 'count') {
      updateHud()
      if (miniRef.value && race) engine?.drawMinimap(miniRef.value, race)
    }
  }
  teleT += dt
  if (teleT > 0.2) {
    teleT = 0
    publishTele()
  }
  beatT += dt
  if (beatT > 2) {
    beatT = 0
    if (race && (phase.value === 'race' || phase.value === 'count')) publishState()
  }
}
let lastCount = 3
let hudT = 0
const goFlash = ref(false)

// audio arm + boot
let armed = false
function arm(): void {
  if (armed) return
  armed = true
  audio.arm()
  audio.loadAssets().then(() => {
    if (phase.value === 'lobby' || phase.value === 'select') audio.playMusic('menu')
  })
}

const resultsRows = computed(() => {
  if (!race) return []
  return race.results().map((k) => ({
    place: k.place,
    name: k.name,
    paint: `#${k.paint.toString(16).padStart(6, '0')}`,
    time: k.finishTime ? fmtTime(k.finishTime) : 'DNF',
    points: pointsForPlace(k.place),
  }))
})

onMounted(async () => {
  // create drivers from the current roster BEFORE subscribing, so a retained pick
  // that replays on subscribe finds its driver.
  syncDrivers()
  wireRelay()
  if (room.host.can('start')) {
    try {
      room.host.start()
    } catch {
      /* already started / not host */
    }
  }
  publishState()

  engine = new PitEngine()
  const ok = stageRef.value ? await engine.init(stageRef.value) : false
  if (ok) {
    engine.loadMap(bakeMap(mapId.value, code.value), getMap(mapId.value))
    if (webrtcSupported()) {
      // spectators get the race video AND the host's music + SFX (Web Audio taps into
      // a MediaStream, the cast-safe path).
      stream = serveStream(
        room,
        () => engine?.getCanvas() ?? null,
        () => audio.getAudioStream(),
      )
      stream.onViewerCount((n) => (viewerCount.value = n))
    }
  }
  last = performance.now()
  raf = requestAnimationFrame(frame)

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  window.addEventListener('resize', onResize)
  window.addEventListener('pointerdown', arm, { once: true })
})

function onKeydown(e: KeyboardEvent): void {
  const k = e.key.toLowerCase()
  keys.add(k)
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
  if (phase.value === 'lobby') {
    if (k === 'enter') addKeyboardDriver()
    if (k === ' ') toSelect()
    if (k === 'c') {
      const i = MAPS.findIndex((m) => m.id === mapId.value)
      selectCourse(MAPS[(i + 1) % MAPS.length]!.id)
    }
    // with a keyboard driver, arrows pick its driver (left/right) + kart (up/down)
    if (kbDriver.value) {
      if (k === 'arrowleft') cycleKbChar(-1)
      else if (k === 'arrowright') cycleKbChar(1)
      else if (k === 'arrowup') cycleKbCart(-1)
      else if (k === 'arrowdown') cycleKbCart(1)
    }
  } else if (phase.value === 'select') {
    if (k === ' ') startRace()
  } else if (phase.value === 'race' || phase.value === 'count') {
    if (k === 'e') {
      const d = drivers.find((x) => x.id === 'kb')
      if (d) d.itemQueued = true
    }
  } else if (phase.value === 'finish') {
    if (k === ' ') (raceNum.value < cupRaces.value ? nextRace() : rematch())
    if (k === 'escape') backToLobby()
  }
}
function onKeyup(e: KeyboardEvent): void {
  keys.delete(e.key.toLowerCase())
}
function onResize(): void {
  if (engine && stageRef.value) engine.resize(stageRef.value.clientWidth, stageRef.value.clientHeight)
}

// react to room roster changes (players join/leave)
let rosterPoll = 0
function watchRoster(): void {
  rosterPoll = window.setInterval(() => {
    // also during 'finish', so a phone that joined mid-race gets seated for the
    // next cup race instead of waiting for someone to back out to the lobby
    if (phase.value === 'lobby' || phase.value === 'select' || phase.value === 'finish') syncDrivers()
  }, 1000)
}
watchRoster()

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  for (const u of unsubs) u()
  clearInterval(rosterPoll)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('resize', onResize)
  stream?.stop()
  engine?.dispose()
  audio.dispose()
})

// expose for the template (shared item iconography)


const slots = computed(() => {
  const out: Array<Driver | null> = []
  for (let i = 0; i < TOTAL_RACERS; i++) out.push(drivers[i] ?? null)
  return out
})

function portraitRef(el: Element | null, charId: string): void {
  if (el instanceof HTMLCanvasElement) drawPortrait(el, charId)
}
</script>

<template>
  <div class="pit-host">
    <div ref="stageRef" class="stage" />

    <!-- in-race chrome -->
    <div v-if="phase === 'race' || phase === 'count' || phase === 'finish'" class="topbar">
      <span class="tt">JOIN</span><span class="rc">{{ code }}</span>
      <span class="tt">{{ courseName }}</span>
      <span class="tt">RACE {{ raceNum }}/{{ cupRaces }}</span>
      <span class="tt clock">{{ fmtTime(race?.raceTime ?? 0) }}</span>
      <span v-if="viewerCount" class="tt">{{ viewerCount }} WATCHING</span>
    </div>

    <!-- split-screen HUD panes -->
    <div v-if="phase === 'race' || phase === 'count'" class="hud">
      <div
        v-for="p in panes"
        :key="p.id"
        class="pane"
        :style="{ left: p.left + '%', top: p.top + '%', width: p.w + '%', height: p.h + '%', borderColor: p.paint }"
      >
        <div class="strip" :style="{ background: p.paint }">
          <span class="pnm">{{ p.name }}</span><span class="spd">{{ p.speed }} KPH</span>
        </div>
        <div class="place">{{ p.place }}<small>{{ ord(p.place).replace(/^\d+/, '') }}</small></div>
        <div class="lap">{{ p.lap }}</div>
        <div class="itembox" :class="{ has: !!p.item }" v-html="itemSvg(p.item)" />
        <div class="driftbar"><i :class="{ max: p.driftMax }" :style="{ width: p.drift * 100 + '%' }" /></div>
        <div v-if="p.wrong" class="wrong"><span>WRONG WAY</span></div>
      </div>
      <div v-if="showMini" class="mini"><canvas ref="miniRef" width="190" height="190" /></div>
      <!-- live standings ladder (full field, incl. the CPUs off-screen); hidden on
           3-4 way splits where it would sit on top of a pane's own HUD -->
      <div v-if="panes.length <= 2" class="ladder">
        <div v-for="s in standings" :key="s.name" class="lrow">
          <span class="lr">{{ s.rank }}</span>
          <span class="lchip" :style="{ background: s.paint }" />
          <span class="lnm">{{ s.name }}</span>
          <span class="llap">{{ s.lap }}</span>
        </div>
      </div>
    </div>

    <!-- countdown -->
    <div v-if="phase === 'count' || goFlash" class="count">
      <div class="badge"><div class="num" :class="{ go: goFlash }">{{ goFlash ? 'GO' : countNum }}</div></div>
    </div>

    <!-- lobby -->
    <div v-if="phase === 'lobby'" class="screen">
      <div class="frame">
        <div class="stripeTop hazard" />
        <div class="idSide">
          <div>
            <h1>PIT PARTY</h1>
            <div class="tag">START YOUR ENGINES</div>
          </div>
          <div class="joinRow">
            <div class="qr"><QrCode :value="joinUrl" :size="120" /></div>
            <div>
              <div class="label">join code</div>
              <div class="bigcode">{{ code }}</div>
              <div class="joinhint">Open <b>{{ joinUrl.replace(/^https?:\/\//, '') }}</b> on a phone, pick a driver + kart.</div>
              <button class="copybtn" @click="copyLink">{{ copied ? 'COPIED' : 'COPY JOIN LINK' }}</button>
            </div>
          </div>
          <div>
            <div class="label">course</div>
            <div class="courseRow">
              <button
                v-for="m in MAPS"
                :key="m.id"
                class="crs"
                :class="{ sel: mapId === m.id }"
                @click="selectCourse(m.id)"
              >
                <span class="sw" :style="{ background: m.theme.swatch }" />
                <span class="cn">{{ m.name }}</span>
                <span class="cb">{{ m.blurb }}</span>
              </button>
            </div>
          </div>
          <div class="settings">
            <button class="pillbtn" @click="cycleLaps">{{ laps }} LAPS</button>
            <button class="pillbtn" @click="cycleCup">{{ cupRaces === 1 ? 'SINGLE RACE' : cupRaces + '-RACE CUP' }}</button>
            <span class="pill">{{ viewerCount ? viewerCount + ' WATCHING' : 'WATCH AT /watch/' + code }}</span>
          </div>
        </div>
        <div class="gridSide">
          <div class="label">grid :: {{ seated.length }} drivers + CPUs</div>
          <div class="slotList">
            <div
              v-for="(d, i) in slots"
              :key="i"
              class="slot"
              :class="{ full: !!d }"
              :style="d ? { borderColor: '#' + getCharacter(d.charId).paint.toString(16).padStart(6, '0') } : {}"
            >
              <canvas v-if="d" :ref="(el) => portraitRef(el as Element, d.charId)" width="52" height="52" />
              <div v-else class="emptycv" />
              <div class="who">
                <span class="nm">{{ d ? d.name : 'OPEN' }}</span>
                <span class="ch">{{ d ? getCharacter(d.charId).name + ' · ' + getCart(d.cartId).name : 'cpu at the gun' }}</span>
              </div>
              <span v-if="d" class="src">{{ d.source }}</span>
            </div>
          </div>
          <div class="ctaRow">
            <button class="btn" :disabled="seated.length === 0" @click="toSelect">PICK & RACE</button>
            <button class="btn ghostbtn" @click="addKeyboardDriver">{{ kbDriver ? 'PLAYING ON KEYS' : '+ PLAY ON KEYBOARD' }}</button>
          </div>
          <div v-if="kbDriver" class="keysBar">
            <span class="kbpick">YOUR RIDE: <b>{{ getCharacter(kbDriver.charId).name }}</b> in the <b>{{ getCart(kbDriver.cartId).name }}</b></span>
            <span><b>&larr; &rarr;</b> driver</span>
            <span><b>&uarr; &darr;</b> kart</span>
            <span><b>WASD</b> drive</span>
            <span><b>SHIFT</b> drift</span>
            <span><b>E</b> item</span>
          </div>
        </div>
      </div>
    </div>

    <!-- selection -->
    <div v-if="phase === 'select'" class="screen">
      <div class="frame selectFrame">
        <div class="stripeTop hazard" />
        <div class="selInner">
          <h1>CHOOSE YOUR RIDE</h1>
          <div class="tag">every phone picks a driver + a kart</div>
          <div class="selGrid">
            <div v-for="d in seated" :key="d.id" class="selCard" :class="{ ready: d.ready }">
              <canvas :ref="(el) => portraitRef(el as Element, d.charId)" width="64" height="64" />
              <div class="selWho">
                <span class="nm">{{ d.name }}</span>
                <span class="ch">{{ getCharacter(d.charId).name }} · {{ getCart(d.cartId).name }}</span>
              </div>
              <span class="rdy">{{ d.ready ? 'READY' : 'PICKING...' }}</span>
            </div>
          </div>
          <div class="ctaRow">
            <button class="btn" @click="startRace">START RACE</button>
            <button class="btn ghostbtn" @click="phase = 'lobby'">BACK</button>
          </div>
        </div>
      </div>
    </div>

    <!-- results -->
    <div v-if="phase === 'finish'" class="screen">
      <div class="resFrame" :class="{ cup: cupRaces > 1 }">
        <div class="stripeTop hazard" />
        <div class="resInner">
          <h2>{{ cupRaces > 1 ? 'RACE ' + raceNum + ' OF ' + cupRaces : 'RACE RESULT' }}</h2>
          <div class="resCols">
            <div class="resCol">
              <div class="colHd">finish</div>
              <div v-for="r in resultsRows" :key="r.name + r.place" class="resRow" :class="{ podium: r.place <= 3 }">
                <span class="pl">{{ ord(r.place) }}</span>
                <span class="chip" :style="{ background: r.paint }" />
                <span class="nm">{{ r.name }}</span>
                <span class="tm">{{ r.time }}</span>
                <span class="pts">+{{ r.points }}</span>
              </div>
            </div>
            <div v-if="cupRaces > 1" class="resCol">
              <div class="colHd">cup standings</div>
              <div v-for="(s, i) in cup" :key="s.id" class="cupRow" :class="{ lead: i === 0 }">
                <span class="pl">{{ i + 1 }}</span>
                <span class="chip" :style="{ background: '#' + s.paint.toString(16).padStart(6, '0') }" />
                <span class="nm">{{ s.name }}</span>
                <span class="pts">{{ s.points }}</span>
              </div>
            </div>
          </div>
          <div class="ctaRow">
            <button v-if="raceNum < cupRaces" class="btn" @click="nextRace">NEXT RACE: {{ nextCourseName }}</button>
            <button v-else class="btn" @click="rematch">REMATCH</button>
            <button class="btn ghostbtn" @click="backToLobby">LOBBY</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pit-host {
  --tarmac: #15131a;
  --pit: #1f1c26;
  --pitline: #2c2837;
  --ink: #0b0a0f;
  --chalk: #f3eee2;
  --smoke: #9d96a8;
  --ghost: #5d5768;
  --hivis: #ffd23f;
  --flag-red: #ff4d5e;
  --flag-green: #5fe08a;
  --font-display: 'Bungee', system-ui, sans-serif;
  --font-ui: 'Chakra Petch', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --shadow-hard: 4px 4px 0 var(--ink);
  --shadow-soft: 2px 2px 0 var(--ink);
  position: absolute;
  inset: 0;
  background: var(--tarmac);
  color: var(--chalk);
  font-family: var(--font-ui);
  overflow: hidden;
}
.stage {
  position: absolute;
  inset: 0;
}
.label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ghost);
}
.btn {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink);
  background: var(--hivis);
  border: 3px solid var(--ink);
  padding: 12px 28px;
  box-shadow: var(--shadow-hard);
  cursor: pointer;
}
.btn:active {
  transform: translate(2px, 2px);
  box-shadow: var(--shadow-soft);
}
.btn:disabled {
  background: var(--pitline);
  color: var(--ghost);
  cursor: default;
}
.btn.ghostbtn {
  background: var(--pit);
  color: var(--chalk);
}
.pillbtn {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--hivis);
  border: 2px solid var(--ink);
  padding: 6px 12px;
  cursor: pointer;
}
.pill {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid var(--pitline);
  background: var(--pit);
  color: var(--smoke);
  padding: 4px 10px;
}
.hazard {
  background: repeating-linear-gradient(-45deg, var(--hivis) 0 14px, var(--ink) 14px 28px);
}
.screen {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 11, 17, 0.86);
}
.frame {
  width: min(1060px, 94vw);
  border: 3px solid var(--ink);
  background: var(--pit);
  box-shadow: 8px 8px 0 var(--ink);
  display: grid;
  grid-template-columns: 1.05fr 1fr;
}
.stripeTop {
  height: 14px;
  grid-column: 1 / -1;
}
.idSide {
  padding: 28px;
  border-right: 2px solid var(--pitline);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h1 {
  font-family: var(--font-display);
  font-size: clamp(40px, 6vw, 76px);
  line-height: 0.9;
  color: var(--hivis);
  text-shadow: 5px 5px 0 var(--ink);
}
.tag {
  font-weight: 700;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--smoke);
  font-size: 13px;
}
.joinRow {
  display: flex;
  gap: 14px;
  align-items: center;
}
.qr {
  background: #fff;
  padding: 6px;
  border: 3px solid var(--ink);
}
.bigcode {
  font-family: var(--font-display);
  font-size: 40px;
  color: var(--chalk);
  letter-spacing: 0.1em;
}
.joinhint {
  font-size: 12px;
  color: var(--smoke);
  margin-top: 6px;
}
.joinhint b {
  color: var(--hivis);
}
.courseRow {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.crs {
  flex: 1 1 28%;
  background: var(--tarmac);
  border: 3px solid var(--pitline);
  padding: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--chalk);
}
.crs .sw {
  height: 8px;
  border: 1px solid var(--ink);
}
.crs .cn {
  font-weight: 700;
  font-size: 11px;
}
.crs .cb {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--ghost);
  text-transform: uppercase;
}
.crs.sel {
  border-color: var(--hivis);
  box-shadow: var(--shadow-soft);
}
.settings {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.gridSide {
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.slotList {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.slot {
  border: 2px solid var(--pitline);
  background: var(--tarmac);
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  position: relative;
}
.slot.full {
  box-shadow: var(--shadow-soft);
}
.slot canvas,
.emptycv {
  width: 48px;
  height: 48px;
  image-rendering: pixelated;
  border: 2px solid var(--ink);
  background: #241f2e;
}
.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.nm {
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ch {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--smoke);
  text-transform: uppercase;
}
.src {
  position: absolute;
  top: -1px;
  right: -1px;
  font-family: var(--font-mono);
  font-size: 9px;
  padding: 2px 6px;
  background: var(--hivis);
  color: var(--ink);
}
.ctaRow {
  display: flex;
  gap: 12px;
  margin-top: auto;
  flex-wrap: wrap;
}
.selectFrame {
  grid-template-columns: 1fr;
}
.selInner {
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.selGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.selCard {
  border: 3px solid var(--pitline);
  background: var(--tarmac);
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.selCard.ready {
  border-color: var(--flag-green);
  box-shadow: var(--shadow-soft);
}
.selCard canvas {
  width: 56px;
  height: 56px;
  image-rendering: pixelated;
}
.selWho {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rdy {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--smoke);
}
.selCard.ready .rdy {
  color: var(--flag-green);
}
/* topbar */
.topbar {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 6px 14px;
  background: var(--pit);
  border: 2px solid var(--ink);
  border-top: 0;
  box-shadow: var(--shadow-soft);
}
.topbar .rc {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--hivis);
  letter-spacing: 0.1em;
}
.topbar .tt {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--smoke);
}
/* hud panes */
.hud {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}
.pane {
  position: absolute;
  border: 2px solid var(--ink);
  overflow: hidden;
}
.pane .strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 2px solid var(--ink);
}
.pane .pnm {
  font-weight: 700;
  font-size: 12px;
  color: var(--ink);
  text-transform: uppercase;
}
.pane .spd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink);
  font-weight: 600;
}
.pane .place {
  position: absolute;
  left: 10px;
  top: 30px;
  font-family: var(--font-display);
  font-size: 48px;
  color: var(--chalk);
  text-shadow: 4px 4px 0 var(--ink);
  line-height: 1;
}
.pane .place small {
  font-size: 20px;
  vertical-align: top;
}
.pane .lap {
  position: absolute;
  left: 12px;
  top: 84px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--chalk);
  background: rgba(11, 10, 15, 0.55);
  padding: 2px 8px;
  border: 1px solid var(--pitline);
}
.pane .itembox {
  position: absolute;
  right: 10px;
  top: 30px;
  width: 56px;
  height: 56px;
  background: var(--pit);
  border: 3px solid var(--ink);
  box-shadow: var(--shadow-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pane .itembox.has {
  border-color: var(--hivis);
}
.pane .itembox :deep(svg) {
  width: 34px;
  height: 34px;
}
/* standings ladder */
.ladder {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 35;
}
.lrow {
  display: grid;
  grid-template-columns: 16px 10px minmax(0, 110px) auto;
  gap: 6px;
  align-items: center;
  background: rgba(11, 10, 15, 0.62);
  border: 1px solid var(--pitline);
  padding: 2px 7px;
}
.lrow .lr {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--hivis);
}
.lrow .lchip {
  width: 9px;
  height: 9px;
  border: 1px solid var(--ink);
}
.lrow .lnm {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
}
.lrow .llap {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--smoke);
}
.pane .driftbar {
  position: absolute;
  left: 12px;
  bottom: 12px;
  width: 110px;
  height: 8px;
  border: 2px solid var(--ink);
  background: rgba(11, 10, 15, 0.55);
}
.pane .driftbar i {
  display: block;
  height: 100%;
  background: var(--hivis);
}
.pane .driftbar i.max {
  background: var(--flag-red);
}
.pane .wrong {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pane .wrong span {
  font-family: var(--font-display);
  font-size: 30px;
  color: var(--flag-red);
  text-shadow: 3px 3px 0 var(--ink);
}
.mini {
  position: absolute;
  right: 14px;
  bottom: 14px;
  border: 2px solid var(--ink);
  background: rgba(21, 19, 26, 0.82);
  box-shadow: var(--shadow-soft);
}
.mini canvas {
  display: block;
}
/* countdown */
.count {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.count .badge {
  min-width: 280px;
  padding: 18px 46px;
  text-align: center;
  background: var(--pit);
  border: 4px solid var(--ink);
  box-shadow: 10px 10px 0 var(--ink);
}
.count .num {
  font-family: var(--font-display);
  font-size: 140px;
  line-height: 1;
  color: var(--hivis);
  text-shadow: 6px 6px 0 var(--ink);
}
.count .num.go {
  color: var(--flag-green);
}
/* copy link + keyboard legend */
.copybtn {
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--hivis);
  border: 2px solid var(--ink);
  padding: 7px 12px;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
}
.copybtn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.keysBar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  padding: 10px 12px;
  border: 2px solid var(--pitline);
  background: var(--tarmac);
}
.keysBar span {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ghost);
}
.keysBar b {
  color: var(--chalk);
  font-weight: 600;
  background: var(--pit);
  border: 1px solid var(--pitline);
  padding: 1px 6px;
}
.keysBar .kbpick {
  color: var(--smoke);
  margin-right: auto;
}
.keysBar .kbpick b {
  color: var(--hivis);
  background: none;
  border: 0;
  padding: 0;
}
/* results */
.resFrame {
  width: min(900px, 94vw);
  max-height: 92vh;
  border: 3px solid var(--ink);
  background: var(--pit);
  box-shadow: 8px 8px 0 var(--ink);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.resFrame.cup {
  width: min(1000px, 95vw);
}
.resInner {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
h2 {
  font-family: var(--font-display);
  font-size: 30px;
  color: var(--hivis);
  text-shadow: 4px 4px 0 var(--ink);
}
.resCols {
  display: flex;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;
}
.resCol {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.resCol:only-child {
  max-width: 540px;
  margin: 0 auto;
  width: 100%;
}
.colHd {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ghost);
  margin-bottom: 2px;
}
.resRow,
.cupRow {
  display: grid;
  grid-template-columns: 40px 20px 1fr auto auto;
  gap: 9px;
  align-items: center;
  border: 2px solid var(--pitline);
  background: var(--tarmac);
  padding: 6px 11px;
}
.cupRow {
  grid-template-columns: 26px 20px 1fr auto;
}
.resRow.podium,
.cupRow.lead {
  border-color: var(--hivis);
}
.resRow .pl,
.cupRow .pl {
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--smoke);
}
.resRow.podium .pl,
.cupRow.lead .pl {
  color: var(--hivis);
}
.resRow .nm,
.cupRow .nm {
  min-width: 0;
  font-size: 13px;
}
.chip {
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  border: 2px solid var(--ink);
  border-radius: 3px;
}
.pts {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--hivis);
  font-weight: 600;
}
.cupRow .pts::after {
  content: ' PTS';
  font-size: 9px;
  color: var(--smoke);
}
.tm {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--smoke);
}
@media (max-width: 880px) {
  .frame {
    grid-template-columns: 1fr;
  }
  .idSide {
    border-right: 0;
    border-bottom: 2px solid var(--pitline);
  }
}
</style>
