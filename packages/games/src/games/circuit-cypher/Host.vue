<script setup lang="ts">
/**
 * Circuit Cypher's big-screen host: the 1v1 rap-battle tournament. A custom-flow
 * view (the generic renderer can't sequence per-matchup performances).
 *
 *  - Lobby: ticket + roster + optional player cap + a sound toggle, then start.
 *  - Write phase: engine round 0 collects everyone's verse (the `bars` block).
 *    When the mic closes, the host builds the bracket (`buildBracket`) from the
 *    verses and switches to the battle.
 *  - Battle phase: the engine stays parked at round 0; the battle is custom relay
 *    state on `/x/battle`. Each matchup runs the full show, adapted from the
 *    rap-battle mockup: a round banner, "now on the mic" intro, a 3-2-1 countdown,
 *    a karaoke performance (TTS word-sync + jaw over a procedural beat with the
 *    music ducked), a "verse complete" hype card, then the head-to-head crowd
 *    vote and the crown. An MC/announcer voice narrates each beat. The 3D arena
 *    (`RapBattleStage`) sits under DOM overlays; SFX + the beat come from the
 *    `ArenaAudio` engine. Votes/cheers arrive over the relay from phones.
 *
 * Everything that decides a winner is the pure, tested logic in
 * `cypher-bracket.ts`/`scoring.ts`; this component is the driver + the show.
 */
import type { RelayValue } from '@doot-games/engine'
import { isEligible } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import {
  type ArenaAudio,
  ConfettiBurst,
  ControlBar,
  CountdownRing,
  DButton,
  Icon,
  RapBattleStage,
  RoomTicket,
  RosterChips,
  announce,
  canSpeak,
  cancelSpeech,
  createArenaAudio,
  primeSpeech,
  speakVerse,
  warmUpSpeech,
} from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { type BarsContent, type BarsInput, barsBlock, renderVerse } from '../../blocks/bars/block'
import GameResults from '../../runtime/GameResults.vue'
import {
  type BattleTally,
  type BattleView,
  type Matchup,
  type Performer,
  battleAward,
  buildBracket,
  scaffoldIndex,
  tallyBattle,
  tournamentLeaderboard,
} from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const MAX_PAIRING_ROUNDS = 3
// The neon battle palette (the rap-battle identity); also fed to the 3D arena.
const LEFT_COLOR = '#16e0ff'
const RIGHT_COLOR = '#ff2d9b'
const GOLD = '#ffd23f'
/** Seconds (ms) a human gets to perform their verse live in players-perform mode. */
const LIVE_PERFORM_MS = 30000
// Pacing (ms). Deliberately unhurried so the show breathes like the mockup.
const PACE = {
  title: 6800, // opening title sequence hold (long enough for the kickoff line)
  banner: 2600, // "BATTLE n" card
  intro: 3200, // "NOW ON THE MIC" card (a beat longer so the callout lands)
  countTick: 1150, // each 3-2-1 beat (a touch more time to get ready)
  drop: 950, // the "DROP IT" beat
  complete: 2600, // "VERSE COMPLETE" card
  postPerform: 1000, // beat after a verse before the next card
}
/** A slightly slower, more deliberate robot-rap cadence. */
const PERFORM_RATE = 0.9

// ── Config / write phase ───────────────────────────────────────────────────
const config = computed<GameComposition | null>(
  () => (room.config.value as unknown as GameComposition) ?? null,
)
const content = computed<BarsContent | null>(
  () => (config.value?.rounds[0]?.content as BarsContent) ?? null,
)
const state = computed(() => room.round.value.state)

// Per-player scaffolds: each performer gets a DIFFERENT couplet set so every rap
// is different. The host assigns a unique scaffold index per pid (incremental and
// stable, so a reconnecting or already-submitted player never gets reshuffled) and
// publishes the map; phones read their own and the host renders each verse with it.
const variants = computed<Array<{ couplets: BarsContent['couplets'] }>>(() => {
  const c = content.value
  if (!c) return []
  return c.variants?.length ? c.variants : [{ couplets: c.couplets }]
})
const coupletsFor = (pid: string): BarsContent['couplets'] => {
  const vs = variants.value
  if (!vs.length) return content.value?.couplets ?? []
  const idx = assignments.get(pid) ?? scaffoldIndex(pid, vs.length)
  return (vs[idx] ?? vs[0])!.couplets
}
const assignments = new Map<string, number>()
function ensureAssignments() {
  // Only hand out scaffolds before the battle starts (assignments freeze at lock).
  if (mode.value === 'battle') return
  const n = variants.value.length
  if (n <= 1) return
  const used = new Set(assignments.values())
  let changed = false
  for (const p of room.players.value) {
    if (assignments.has(p.id)) continue
    let idx = 0
    while (idx < n && used.has(idx)) idx++
    if (idx >= n) idx = assignments.size % n // pool exhausted: wrap (rare)
    assignments.set(p.id, idx)
    used.add(idx)
    changed = true
  }
  if (changed) room.publishExtra('assign', Object.fromEntries(assignments))
}

const now = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const countdown = computed(() => {
  const dl = room.round.value.deadline
  const timer = content.value ? barsBlock.timerOf?.(content.value) : null
  if (!dl || !timer) return null
  return { remaining: Math.max(0, dl - now.value), total: timer * 1000 }
})
const lockCount = computed(() => {
  const inputs = room.inputsFor(0)
  let locked = 0
  let total = 0
  for (const p of room.players.value) {
    if (!isEligible(p.joinedAtIndex, 0)) continue
    total++
    if (inputs.has(p.id)) locked++
  }
  return { locked, total }
})

const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 20 : null
}
function setCap(raw: string) {
  const n = Math.floor(Number(raw))
  playerCap.value = Number.isFinite(n) && n > 0 ? n : null
}

// ── Audio + reduced motion ─────────────────────────────────────────────────
const audio = shallowRef<ArenaAudio | null>(null)
const muted = ref(false)
const calm = ref(false)
/** Robots perform via TTS (default), or the players perform live (beat + timer). */
const performMode = ref<'robots' | 'live'>('robots')
function setMuted(m: boolean) {
  muted.value = m
  audio.value?.setMuted(m)
  if (m) {
    cancelSpeech()
  } else {
    // Unmuting is a gesture: re-activate speech, and make sure the beat is running.
    primeSpeech()
    if (mode.value === 'battle') void audio.value?.start()
  }
}
function mcSay(text: string, onDone?: () => void, onStart?: () => void) {
  if (!muted.value && canSpeak()) announce(text, { onDone, onStart })
  else onDone?.()
}

// ── Battle state ───────────────────────────────────────────────────────────
type Fine =
  | 'title'
  | 'banner'
  | 'introA'
  | 'countA'
  | 'performA'
  | 'completeA'
  | 'introB'
  | 'countB'
  | 'performB'
  | 'completeB'
  | 'vote'
  | 'result'

const mode = ref<'write' | 'battle'>('write')
const fine = ref<Fine>('banner')
const matchups = ref<Matchup[]>([])
const matchupIndex = ref(0)
const droppedRounds = ref(0)
const verses = new Map<string, { name: string; verse: string }>()
// Per-matchup votes, keyed by pid. Stored as `{ choice }` objects because that is
// what `tallyBattle` reads (a bare string would tally as zero).
const votes = new Map<number, Map<string, { choice: 'a' | 'b' }>>()
const cheers = new Map<number, { left: number; right: number }>()
const awards = ref<Array<Record<string, number>>>([])
const lastResult = ref<BattleTally | null>(null)
const tick = ref(0)

// Show overlays
const card = ref<{ kicker?: string; big: string; sub?: string; color: string } | null>(null)
const countNum = ref<number | null>(null)
// The performed verse, kept as LINES (so the couplet structure shows and wraps in
// its box) plus a flat word count / current word for the karaoke highlight.
interface Karaoke {
  lines: Array<{ words: string[]; start: number }>
  count: number
  active: number
}
const karaoke = ref<Karaoke | null>(null)
/** Build the line/word structure from a verse (the bars block joins lines with \n). */
function buildKaraoke(verse: string): Karaoke {
  let start = 0
  const lines = verse
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const words = l.split(/\s+/).filter(Boolean)
      const entry = { words, start }
      start += words.length
      return entry
    })
  return { lines, count: start, active: 0 }
}
const confetti = ref(false)
// Live-perform countdown (players-perform mode): the deadline drives a ring.
const performDeadline = ref<number | null>(null)
const performRing = computed(() => {
  if (performDeadline.value == null) return null
  return { remaining: Math.max(0, performDeadline.value - now.value), total: LIVE_PERFORM_MS }
})

// Sequencer
const pending = ref<null | (() => void)>(null)
let timers: ReturnType<typeof setTimeout>[] = []
let karRAF = 0
function schedule(fn: () => void, ms: number) {
  const id = setTimeout(fn, ms)
  timers.push(id)
  pending.value = fn
}
function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}
/** Hard ceiling on waiting for an MC line that STARTED but never reports its end,
 *  so a wedged voice can't stall the show. Scaled to the line's length (generous,
 *  ~11 chars/sec) so a short callout advances in a few seconds instead of sitting
 *  on a flat ~18s ceiling, while the long opening welcome line still finishes
 *  before the cap rather than being cut off. Clamped both ways. */
function speechCapMs(text: string, minHold: number): number {
  // ~9 chars/sec is deliberately slow so a slow platform voice still finishes the
  // long welcome line (~194 chars -> ~23s) before the cap rather than being cut
  // off, while a short callout that wedges still advances in a few seconds.
  const est = Math.min(26000, Math.max(2500, text.length * 110 + 2000))
  return Math.max(minHold, est)
}
/**
 * Speak an MC line, then advance to `next` only once the line FINISHES, so intros
 * are never cut off mid-sentence. The card holds at least `minHold` ms (a visual
 * beat) and never longer than the safety cap. Skip still fast-forwards (the
 * pending action is the advance). With speech muted/unavailable this is just the
 * old fixed-pace transition.
 */
function sayThenAdvance(text: string, next: Fine, minHold: number) {
  let advanced = false
  const start = performance.now()
  const go = () => {
    if (advanced) return
    advanced = true
    enter(next)
  }
  pending.value = go
  if (muted.value || !canSpeak()) {
    schedule(go, minHold)
    return
  }
  // If the voice never actually STARTS (Chrome/macOS silently drops some voices,
  // especially network ones), don't sit on the long safety cap waiting for an
  // onDone that will never come, which froze the whole show for ~18s a beat.
  // Advance at the normal written pace instead; a working voice fires onStart
  // first, which cancels this and we wait for the real end of the line.
  let started = false
  timers.push(
    setTimeout(() => {
      if (!started) go()
    }, Math.max(minHold, 1600)),
  )
  // Safety cap in case a voice that DID start never fires onDone.
  timers.push(setTimeout(go, speechCapMs(text, minHold)))
  mcSay(
    text,
    () => {
      // Speech finished: advance, but keep the card up for the rest of minHold.
      timers.push(setTimeout(go, Math.max(0, minHold - (performance.now() - start))))
    },
    () => {
      started = true
    },
  )
}
function stopKaraoke() {
  if (karRAF) cancelAnimationFrame(karRAF)
  karRAF = 0
}

function nameFor(pid: string): string {
  return room.players.value.find((p) => p.id === pid)?.name ?? 'Robot'
}
function performerOf(pid: string): Performer {
  const v = verses.get(pid)
  return { pid, name: v?.name ?? nameFor(pid), verse: v?.verse ?? '' }
}
const cur = computed(() => matchups.value[matchupIndex.value] ?? null)
const curLeft = computed(() => (cur.value ? performerOf(cur.value.a) : null))
const curRight = computed(() => (cur.value ? performerOf(cur.value.b) : null))
const isLastMatchup = computed(() => matchupIndex.value >= matchups.value.length - 1)
// verses is a plain Map; matchups (reactive) is set right after it in beginBattle,
// so depend on it to recompute once the lineup is known.
const performerCount = computed(() => {
  void matchups.value.length
  return verses.size
})

const performing = computed<'left' | 'right' | null>(() =>
  fine.value === 'performA' ? 'left' : fine.value === 'performB' ? 'right' : null,
)
const winnerSide = computed<'left' | 'right' | 'tie' | null>(() => {
  const r = lastResult.value
  if (!r) return null
  return r.winner === 'a' ? 'left' : r.winner === 'b' ? 'right' : 'tie'
})
const focus = computed<'wide' | 'left' | 'right' | 'vote'>(() => {
  switch (fine.value) {
    case 'title':
    case 'banner':
      return 'wide'
    case 'introA':
    case 'countA':
    case 'performA':
    case 'completeA':
      return 'left'
    case 'introB':
    case 'countB':
    case 'performB':
    case 'completeB':
      return 'right'
    case 'vote':
      return 'vote'
    case 'result':
      return winnerSide.value === 'right' ? 'right' : 'left'
  }
})
const victor = computed<'left' | 'right' | null>(() =>
  fine.value === 'result' && winnerSide.value !== 'tie' ? (winnerSide.value as 'left' | 'right' | null) : null,
)
const liveTally = computed<BattleTally>(() => {
  void tick.value
  const m = cur.value
  if (!m) return { winner: 'tie', votesA: 0, votesB: 0 }
  return tallyBattle(votes.get(matchupIndex.value) ?? new Map(), m.a, m.b)
})
const votePct = computed(() => {
  const t = liveTally.value
  const tot = t.votesA + t.votesB
  return tot ? { a: Math.round((t.votesA / tot) * 100), b: 100 - Math.round((t.votesA / tot) * 100) } : { a: 0, b: 0 }
})
// Running cash for the two performers on screen (for the score chips).
const cashByPid = computed(() => {
  void tick.value
  const m = new Map<string, number>()
  for (const a of awards.value) for (const [pid, n] of Object.entries(a)) m.set(pid, (m.get(pid) ?? 0) + n)
  return m
})

const HYPE = [
  { big: 'CLEAN BARS!', sub: 'Verse complete. Mic still smoking.' },
  { big: 'CIRCUITS FRIED!', sub: 'Not a single dropped frame.' },
  { big: 'THE CROWD GOES OFF!', sub: 'That hook is going viral.' },
  { big: 'BARS DELIVERED!', sub: 'Hard drive officially full.' },
]
function hypeCard(color: string) {
  // Vary by matchup+side without Math.random (unavailable in some sandboxes is
  // fine here, but keep it deterministic-ish off the index for a stable show).
  const k = (matchupIndex.value * 2 + (fine.value === 'completeB' ? 1 : 0)) % HYPE.length
  const h = HYPE[k] ?? HYPE[0]!
  return { kicker: 'VERSE COMPLETE', big: h.big, sub: h.sub, color }
}

function publishBattle() {
  const m = cur.value
  if (!m) return
  const view: BattleView =
    fine.value === 'title' || fine.value === 'banner' || fine.value === 'introA' || fine.value === 'countA'
      ? 'intro'
      : fine.value === 'vote'
        ? 'vote'
        : fine.value === 'result'
          ? 'result'
          : 'perform'
  const res = fine.value === 'result' ? lastResult.value : null
  room.publishExtra('battle', {
    i: matchupIndex.value,
    total: matchups.value.length,
    view,
    performing: performing.value,
    left: performerOf(m.a),
    right: performerOf(m.b),
    votesLeft: res?.votesA ?? 0,
    votesRight: res?.votesB ?? 0,
    winner: res ? (res.winner === 'a' ? 'left' : res.winner === 'b' ? 'right' : 'tie') : null,
  } as unknown as RelayValue)
}

function runCountdown(side: 'A' | 'B') {
  let n = 3
  const step = () => {
    if (n > 0) {
      audio.value?.countBeep(false)
      countNum.value = n
      n--
      schedule(step, PACE.countTick)
    } else {
      countNum.value = null
      audio.value?.countBeep(true)
      card.value = { big: 'DROP IT', color: side === 'A' ? LEFT_COLOR : RIGHT_COLOR }
      schedule(() => enter(side === 'A' ? 'performA' : 'performB'), PACE.drop)
    }
  }
  step()
}

function performSide(left: boolean) {
  const perf = left ? curLeft.value : curRight.value
  if (!perf || !perf.verse.trim()) {
    schedule(() => enter(left ? 'completeA' : 'completeB'), 400)
    return
  }
  const kara = buildKaraoke(perf.verse)
  const count = kara.count
  const setActive = (k: number) => {
    karaoke.value = { lines: kara.lines, count, active: Math.max(0, Math.min(k, count)) }
  }
  setActive(0)
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    stopKaraoke()
    performDeadline.value = null
    setActive(count) // the whole verse lands "done"
    audio.value?.duck(false)
    cancelSpeech()
    schedule(() => enter(left ? 'completeA' : 'completeB'), PACE.postPerform)
  }
  pending.value = finish

  // Players-perform-live mode: show the whole verse, run a timer over the beat
  // (no TTS), and let the human rap it out loud. Skip ends it early.
  if (performMode.value === 'live') {
    setActive(count)
    performDeadline.value = now.value + LIVE_PERFORM_MS
    mcSay(`Take it away, ${perf.name}! Sing it!`)
    schedule(finish, LIVE_PERFORM_MS)
    return
  }

  // Robots-perform mode: karaoke + the robot voice over a ducked beat.
  audio.value?.duck(true)
  // Time-based fallback that drives the karaoke + guarantees completion even if
  // the browser emits no speech-boundary events (or speech is muted/absent).
  const est = (count / (2.2 * PERFORM_RATE)) * 1000 + 1600
  const startT = performance.now()
  const tickKar = () => {
    if (finished) return
    const t = performance.now() - startT
    const byTime = Math.min(count - 1, Math.floor((t / est) * count))
    if (byTime > (karaoke.value?.active ?? 0)) setActive(byTime)
    karRAF = requestAnimationFrame(tickKar)
  }
  tickKar()
  if (!muted.value && canSpeak()) {
    // Both robots share one reliable voice (see speech.ts); they're told apart by
    // pitch + rate. Left = deeper/slower, right = brighter/quicker. Both clearly
    // robotic, and neither depends on a second platform voice existing.
    speakVerse(perf.verse, {
      // Both robots share one reliable voice (distinct from the MC); the deep/slow
      // left vs bright/quick right pitch+rate tell the two performers apart without
      // risking a silent side on a voice the device can't actually play.
      side: left ? 'a' : 'b',
      pitch: left ? 0.5 : 1.0,
      rate: left ? PERFORM_RATE : PERFORM_RATE + 0.1,
      onWord: (k) => {
        if (!finished) setActive(k)
      },
      onDone: finish,
    })
  }
  schedule(finish, est + 1800)
}

function enter(step: Fine) {
  clearTimers()
  stopKaraoke()
  cancelSpeech()
  pending.value = null
  if (step !== 'performA' && step !== 'performB') performDeadline.value = null
  fine.value = step
  const nameL = curLeft.value?.name ?? ''
  const nameR = curRight.value?.name ?? ''
  switch (step) {
    case 'title':
      card.value = null
      countNum.value = null
      karaoke.value = null
      confetti.value = false
      audio.value?.airhorn()
      publishBattle()
      sayThenAdvance(
        performMode.value === 'live'
          ? "Welcome to the Circuit Cypher! Tonight the humans hold the mic. Warm up those vocal cords, because in a moment you'll be spitting these bars live. Let's find out who runs this room!"
          : `Welcome to the Circuit Cypher, where the bars are silicon and the beat is pure voltage! ${performerCount.value} MCs stepped to the mic, but only one runs the cypher. Power up, line them up, and let the robots battle!`,
        'banner',
        PACE.title,
      )
      break
    case 'banner':
      card.value = { kicker: 'NOW BATTLING', big: `BATTLE ${matchupIndex.value + 1}`, sub: `${nameL} VS ${nameR}`, color: GOLD }
      countNum.value = null
      karaoke.value = null
      confetti.value = false
      audio.value?.airhorn()
      publishBattle()
      sayThenAdvance(`Matchup ${matchupIndex.value + 1}. ${nameL} versus ${nameR}!`, 'introA', PACE.banner)
      break
    case 'introA':
      card.value = { kicker: 'NOW ON THE MIC', big: nameL, color: LEFT_COLOR }
      audio.value?.cheer()
      publishBattle()
      sayThenAdvance(
        performMode.value === 'live'
          ? `${nameL}, this verse is all yours. Grab the mic and get ready to sing it yourself!`
          : `On the mic... ${nameL}!`,
        'countA',
        PACE.intro,
      )
      break
    case 'countA':
      card.value = null
      publishBattle()
      runCountdown('A')
      break
    case 'performA':
      card.value = null
      publishBattle()
      performSide(true)
      break
    case 'completeA':
      karaoke.value = null
      card.value = hypeCard(LEFT_COLOR)
      audio.value?.cheer()
      publishBattle()
      schedule(() => enter('introB'), PACE.complete)
      break
    case 'introB':
      card.value = { kicker: 'NOW ON THE MIC', big: nameR, color: RIGHT_COLOR }
      audio.value?.cheer()
      publishBattle()
      sayThenAdvance(
        performMode.value === 'live'
          ? `${nameR}, you're up next. Take the mic and get ready to sing your verse out loud!`
          : `And now... ${nameR}!`,
        'countB',
        PACE.intro,
      )
      break
    case 'countB':
      card.value = null
      publishBattle()
      runCountdown('B')
      break
    case 'performB':
      card.value = null
      publishBattle()
      performSide(false)
      break
    case 'completeB':
      karaoke.value = null
      card.value = hypeCard(RIGHT_COLOR)
      audio.value?.cheer()
      publishBattle()
      schedule(() => enter('vote'), PACE.complete)
      break
    case 'vote':
      card.value = null
      karaoke.value = null
      audio.value?.airhorn()
      mcSay('Who took the round?')
      publishBattle()
      pending.value = resolveVote
      schedule(resolveVote, 30000) // safety auto-resolve so the show never hangs
      break
    case 'result':
      showResult()
      break
  }
}

function resolveVote() {
  if (fine.value === 'result') return
  clearTimers()
  const m = cur.value
  if (!m) return
  const tally = tallyBattle(votes.get(matchupIndex.value) ?? new Map(), m.a, m.b)
  const c = cheers.get(matchupIndex.value) ?? { left: 0, right: 0 }
  awards.value.push(battleAward({ a: m.a, b: m.b, tally, cheersA: c.left, cheersB: c.right }))
  lastResult.value = tally
  enter('result')
}

function showResult() {
  const side = winnerSide.value
  const nameL = curLeft.value?.name ?? ''
  const nameR = curRight.value?.name ?? ''
  const name = side === 'left' ? nameL : side === 'right' ? nameR : null
  card.value = {
    kicker: 'WINNER OF THE ROUND',
    big: side === 'tie' ? 'TIE!' : (name ?? 'TIE!'),
    color: side === 'left' ? LEFT_COLOR : side === 'right' ? RIGHT_COLOR : GOLD,
  }
  confetti.value = true
  audio.value?.airhorn()
  audio.value?.cheer()
  mcSay(side === 'tie' ? "It's a tie!" : `Your winner... ${name}!`)
  publishBattle()
  pending.value = null
}

function advanceMatchup() {
  confetti.value = false
  if (isLastMatchup.value) {
    finishTournament()
    return
  }
  matchupIndex.value++
  enter('banner')
}

function skip() {
  const fn = pending.value
  if (!fn) return
  pending.value = null
  clearTimers()
  stopKaraoke()
  cancelSpeech()
  fn()
}

// ── Co-host / MC delegation ────────────────────────────────────────────────
// The host can hand the advance controls to a player (engine `setDriver`); the
// delegate's phone shows ONE button for the current primary action and sends an
// intent over `/x/drive` (validated by driverPid + nonce, like B9). `primaryDrive`
// is the same action the host's main button performs, so write + battle both work.
const firstToJoin = ref(true)
const driverPid = computed(() => room.driverPid.value)
const driverName = computed(() => room.players.value.find((p) => p.id === driverPid.value)?.name ?? '')
function pickDriver(pid: string) {
  room.host.setDriver(pid || null)
}
watch([firstToJoin, () => room.players.value.length], () => {
  if (firstToJoin.value && !room.driverPid.value && room.players.value[0]) {
    room.host.setDriver(room.players.value[0].id)
  }
})
let lastDriveNonce: number | null = null
function primaryDrive() {
  if (room.phase.value !== 'active') return
  if (mode.value === 'write') {
    if (room.host.can('open')) room.host.openVoting()
    else if (room.host.can('lock')) room.host.lock()
    return
  }
  if (fine.value === 'vote') resolveVote()
  else if (fine.value === 'result') advanceMatchup()
  else if (pending.value) skip()
}

function beginBattle() {
  if (mode.value !== 'write') return
  const c = content.value
  if (!c) return
  verses.clear()
  for (const [pid, inp] of room.inputsFor(0)) {
    // Render each performer's verse against THEIR assigned scaffold, so the robot
    // lead lines match what that player actually wrote their rhymes for.
    const verse = renderVerse({ ...c, couplets: coupletsFor(pid) }, inp as unknown as BarsInput)
    if (verse.trim()) verses.set(pid, { name: nameFor(pid), verse })
  }
  const bracket = buildBracket([...verses.keys()], MAX_PAIRING_ROUNDS)
  matchups.value = bracket.matchups
  droppedRounds.value = bracket.droppedRounds
  matchupIndex.value = 0
  awards.value = []
  lastResult.value = null
  mode.value = 'battle'
  if (matchups.value.length === 0) {
    finishTournament()
    return
  }
  if (!muted.value) void audio.value?.start()
  enter('title') // open with the cinematic title sequence, then the first battle
}

function finishTournament() {
  clearTimers()
  stopKaraoke()
  cancelSpeech()
  audio.value?.stop()
  const names = new Map([...verses].map(([pid, v]) => [pid, v.name] as const))
  const board = tournamentLeaderboard(awards.value, names)
  const top = board[0]
  const summary: StandardResults = {
    headline: top && top.cash > 0 ? `${top.name} runs the cypher!` : 'The cypher is closed',
    leaderboard: board.map((p) => ({ id: p.id, name: p.name, score: p.cash, detail: `$${p.cash}` })),
    stats: [
      { label: 'Battles', value: matchups.value.length },
      { label: 'MCs', value: names.size },
    ],
  }
  room.host.finish(summary as unknown as RelayValue)
}

function startGame() {
  // A user gesture: prime/resume the audio context AND the speech engine now so
  // the beat and the robot voices actually play when the battle starts later (the
  // first real line is fired from a timer, which some browsers would otherwise
  // drop unless speech was activated within an interaction).
  audio.value?.setMuted(muted.value)
  primeSpeech()
  room.host.start()
}

function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

onMounted(() => {
  now.value = Date.now()
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 250)
  if (typeof window !== 'undefined' && window.matchMedia) {
    // prefers-reduced-motion is about MOTION, not sound: calm the animation but
    // leave audio on by default (the robots still rap; the host can mute). Muting
    // here used to silence the whole performance for reduced-motion users.
    calm.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  warmUpSpeech() // prime TTS voices so the first verse actually speaks
  audio.value = createArenaAudio()
  audio.value.setMuted(muted.value)

  // Collect votes + cheers off the custom channels (keyed by pid: a reconnecting
  // phone's re-vote overwrites instead of double-counting).
  room.onExtra('vote/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const choice = (v as { choice?: unknown })?.choice
    if (!Number.isInteger(i) || !pid || (choice !== 'a' && choice !== 'b')) return
    let m = votes.get(i)
    if (!m) {
      m = new Map()
      votes.set(i, m)
    }
    m.set(pid, { choice })
    tick.value++
  })
  room.onExtra('cheer/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const side = (v as { side?: unknown })?.side
    if (!Number.isInteger(i) || (side !== 'left' && side !== 'right')) return
    let c = cheers.get(i)
    if (!c) {
      c = { left: 0, right: 0 }
      cheers.set(i, c)
    }
    c[side]++
    tick.value++
  })
  // A drive intent from the delegated MC: apply only from the current driver, and
  // drop relay re-deliveries by nonce (mirrors the engine's B9 validation).
  room.onExtra('drive/*/*', (v, key) => {
    const pid = key.split('/')[1] // drive/<pid>/cmd
    const cmd = v as { nonce?: number } | null
    if (!cmd || cmd.nonce == null || !pid) return
    if (pid !== room.driverPid.value) return // only the current delegate may drive
    if (cmd.nonce === lastDriveNonce) return // drop a relay re-delivery
    lastDriveNonce = cmd.nonce
    primaryDrive()
  })
})

// Drive the write -> battle transition off the reactive round state. On a host
// page RELOAD the relay re-delivers the locked round state and the player inputs
// as separate retained values, in any order, so reading inputs the instant we see
// "locked" can find them empty (or half-arrived) and build an empty/partial
// bracket that ends the cypher immediately. So wait until the verse count settles
// (two equal, non-zero reads) before building, and only fall through to an empty
// finish after a short grace cap (a genuinely verse-less room).
let lastInputCount = -1
let battleAttempts = 0
function tryBeginBattle() {
  if (mode.value !== 'write') return
  if (room.phase.value !== 'active' || room.round.value.state !== 'locked') return
  const n = room.inputsFor(0).size
  if ((n === 0 || n !== lastInputCount) && battleAttempts < 14) {
    lastInputCount = n
    battleAttempts++
    // Tracked in `timers` so it is cleared on unmount; avoids `schedule`'s
    // `pending` side-effect (which is the battle-phase skip target).
    timers.push(setTimeout(tryBeginBattle, 300))
    return
  }
  beginBattle()
}
watch(
  () => `${room.phase.value}:${room.round.value.state}`,
  () => {
    if (room.phase.value === 'active' && room.round.value.state === 'locked' && mode.value === 'write') {
      lastInputCount = -1
      battleAttempts = 0
      tryBeginBattle()
    }
  },
)

// Assign + publish a unique verse scaffold for each player as the roster fills.
watch(
  () => room.players.value.map((p) => p.id).join(','),
  () => ensureAssignments(),
  { immediate: true },
)

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  clearTimers()
  stopKaraoke()
  cancelSpeech()
  audio.value?.stop()
})
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="lobby">
    <section class="panel ticket-card">
      <RoomTicket :code="room.runtime.room" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="roster-head">
        <div class="kicker">In the cypher</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />

      <div class="cap-pick">
        <label class="cap-row">
          <input
            type="checkbox"
            :checked="playerCap != null"
            @change="toggleCap(($event.target as HTMLInputElement).checked)"
          />
          <span class="kicker">Limit how many can join</span>
        </label>
        <input
          v-if="playerCap != null"
          type="number"
          min="1"
          inputmode="numeric"
          class="cap-input"
          :value="playerCap ?? 20"
          aria-label="Maximum players"
          @input="setCap(($event.target as HTMLInputElement).value)"
        />
      </div>

      <label class="mute-row">
        <input type="checkbox" :checked="!muted" @change="setMuted(!($event.target as HTMLInputElement).checked)" />
        <span class="kicker">Music and robot voices</span>
      </label>

      <div class="perform-pick">
        <span class="kicker">Who performs the verses</span>
        <div class="seg" role="group" aria-label="Who performs the verses">
          <button
            type="button"
            class="seg-btn"
            :class="{ on: performMode === 'robots' }"
            :aria-pressed="performMode === 'robots'"
            @click="performMode = 'robots'"
          >
            <Icon name="cpu" :size="18" /> The robots
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ on: performMode === 'live' }"
            :aria-pressed="performMode === 'live'"
            @click="performMode = 'live'"
          >
            <Icon name="mic" :size="18" /> Players, live
          </button>
        </div>
      </div>

      <div class="cohost-pick">
        <span class="kicker">Who drives the game</span>
        <select
          class="cohost-select"
          aria-label="Who drives the game"
          :value="driverPid ?? ''"
          @change="pickDriver(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Just me (host)</option>
          <option v-for="p in room.players.value" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <label class="cohost-first">
          <input
            type="checkbox"
            :checked="firstToJoin"
            @change="firstToJoin = ($event.target as HTMLInputElement).checked"
          />
          <span>Let the first to join drive</span>
        </label>
      </div>

      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!config" @click="startGame">Start the cypher</DButton>
      </div>
      <p class="note">
        Everyone writes one verse, then the robots battle head to head. You need at least two MCs.
      </p>
    </section>
  </div>

  <!-- RESULTS -->
  <div v-else-if="room.phase.value === 'results' && room.results.value" class="results-wrap">
    <GameResults :results="room.results.value as any" />
    <div class="results-next">
      <button type="button" class="btn btn-primary btn-lg" @click="playAgain">Play again</button>
      <a class="btn btn-ghost btn-lg" href="/explore">Pick another game</a>
      <a class="btn btn-ghost btn-lg" href="/">Home</a>
    </div>
  </div>

  <!-- BATTLE PHASE -->
  <div v-else-if="mode === 'battle' && cur && curLeft && curRight" class="arena" :style="{ '--p1': LEFT_COLOR, '--p2': RIGHT_COLOR, '--gold': GOLD }">
    <RapBattleStage
      :left="{ name: curLeft.name, color: LEFT_COLOR }"
      :right="{ name: curRight.name, color: RIGHT_COLOR }"
      :performing="performing"
      :focus="focus"
      :victor="victor"
      :audio="audio"
      :calm="calm"
    />
    <ConfettiBurst v-if="confetti" class="arena-confetti" />
    <div class="overlays">
      <!-- opening title sequence -->
      <div v-if="fine === 'title'" class="title-seq">
        <div class="t-big">CIRCUIT CYPHER</div>
        <div class="t-vs">// ROBOT RAP BATTLE //</div>
        <div class="t-sub">
          {{ performerCount }} {{ performerCount === 1 ? 'MC steps' : 'MCs step' }} to the mic.
          {{ matchups.length }} {{ matchups.length === 1 ? 'battle' : 'battles' }}. One champion.
        </div>
      </div>

      <!-- top HUD -->
      <div class="hud-top">
        <span class="tag round-tag">BATTLE {{ matchupIndex + 1 }} / {{ matchups.length }}</span>
        <span class="tag live"><span class="dot" />LIVE</span>
      </div>
      <div class="score">
        <span class="chip p1"><span class="pip" />{{ curLeft.name }} <b>${{ cashByPid.get(cur.a) ?? 0 }}</b></span>
        <span class="chip p2"><span class="pip" />{{ curRight.name }} <b>${{ cashByPid.get(cur.b) ?? 0 }}</b></span>
      </div>

      <!-- stage card -->
      <div v-if="card" :key="`card-${card.big}`" class="stage-card" :style="{ color: card.color }">
        <div v-if="card.kicker" class="kicker">{{ card.kicker }}</div>
        <div class="big pop">{{ card.big }}</div>
        <div v-if="card.sub" class="sub">{{ card.sub }}</div>
      </div>

      <!-- countdown -->
      <div v-if="countNum != null" :key="`count-${countNum}`" class="countnum">{{ countNum }}</div>

      <!-- karaoke verse -->
      <div v-if="karaoke" class="perform">
        <div class="pf-name" :style="{ color: performing === 'left' ? LEFT_COLOR : RIGHT_COLOR }">
          <Icon name="mic" :size="26" />
          <b>{{ performing === 'left' ? curLeft.name : curRight.name }}</b>
          <span v-if="performRing" class="live-tag">PERFORM LIVE</span>
          <CountdownRing v-if="performRing" :remaining="performRing.remaining" :total="performRing.total" />
        </div>
        <div class="verse-box" :style="{ borderColor: performing === 'left' ? LEFT_COLOR : RIGHT_COLOR, color: performing === 'left' ? LEFT_COLOR : RIGHT_COLOR }">
          <div class="verse">
            <div v-for="(line, li) in karaoke.lines" :key="li" class="vline">
              <span
                v-for="(w, wi) in line.words"
                :key="wi"
                class="w"
                :class="{ on: line.start + wi === karaoke.active, done: line.start + wi < karaoke.active }"
              >{{ w }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- vote panel -->
      <div v-if="fine === 'vote'" class="vote">
        <h2>WHO TOOK THE ROUND?</h2>
        <div class="pair">
          <div class="voter p1">
            <div class="nm">{{ curLeft.name }}</div>
            <div class="bar-wrap"><div class="bar" :style="{ width: `${votePct.a}%` }" /></div>
            <div class="pct">{{ liveTally.votesA }} {{ liveTally.votesA === 1 ? 'vote' : 'votes' }}</div>
          </div>
          <div class="voter p2">
            <div class="nm">{{ curRight.name }}</div>
            <div class="bar-wrap"><div class="bar" :style="{ width: `${votePct.b}%` }" /></div>
            <div class="pct">{{ liveTally.votesB }} {{ liveTally.votesB === 1 ? 'vote' : 'votes' }}</div>
          </div>
        </div>
        <p class="hint">Phones are voting. Reveal when the crowd has spoken.</p>
      </div>

      <!-- driving note (a delegated MC drives from their phone) -->
      <div v-if="driverName" class="driving-note">
        <span class="dn-label"><Icon name="mc" :size="16" /> {{ driverName }} is driving</span>
        <button type="button" class="take-back" @click="room.host.setDriver(null)">Take back</button>
      </div>

      <!-- controls -->
      <div class="ctrls">
        <button class="ctrl" type="button" :aria-label="muted ? 'Unmute' : 'Mute'" @click="setMuted(!muted)">
          <Icon :name="muted ? 'mute' : 'volume'" :size="20" />
        </button>
        <button v-if="pending && fine !== 'vote'" class="ctrl" type="button" aria-label="Skip" @click="skip">
          <Icon name="skip" :size="20" />
        </button>
        <DButton v-if="fine === 'vote'" variant="primary" @click="resolveVote">Reveal the winner</DButton>
        <DButton v-else-if="fine === 'result'" variant="primary" @click="advanceMatchup">
          <span class="btn-ico"><template v-if="isLastMatchup"><Icon name="crown" :size="18" /> Crown the MC</template><template v-else>Next battle</template></span>
        </DButton>
      </div>
    </div>
  </div>

  <!-- WRITE PHASE (engine round 0) -->
  <div v-else-if="content" class="stage">
    <div class="stage-grid">
      <div class="left">
        <span class="subject">{{ content.subject || 'The Cypher' }}</span>
        <h1 class="prompt">{{ content.prompt }}</h1>
      </div>
      <div class="right">
        <component :is="barsBlock.HostDisplay" :content="content" :inputs="room.inputsFor(0)" :state="state" />
      </div>
    </div>
    <ControlBar
      :round-index="0"
      :round-count="1"
      :state-label="state === 'open' ? 'Writing bars' : state === 'locked' ? 'Mic closed' : 'Get ready'"
      :locked-in="lockCount.locked"
      :total="state === 'open' ? lockCount.total : 0"
    >
      <CountdownRing v-if="countdown" :remaining="countdown.remaining" :total="countdown.total" />
      <DButton v-if="room.host.can('open')" variant="primary" size="lg" @click="room.host.openVoting()">
        Open the mic
      </DButton>
      <DButton v-else-if="room.host.can('lock')" variant="primary" size="lg" @click="room.host.lock()">
        Close the mic →
      </DButton>
      <span v-else class="building">Building the bracket…</span>
    </ControlBar>
  </div>

  <div v-else class="stage"><p>Getting the cypher ready…</p></div>
</template>

<style scoped>
.lobby {
  flex: 1;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 18px;
  align-items: start;
}
.ticket-card {
  padding: 30px;
}
.roster-card {
  padding: 22px;
}
.roster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.count {
  color: var(--c5);
  font-weight: 700;
}
.cap-pick {
  margin-top: 16px;
}
.cap-row,
.mute-row {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.mute-row {
  margin-top: 18px;
}
/* Big, easy-to-hit checkboxes + labels so the lobby is usable from across the
   room on a TV. */
.cap-row input[type='checkbox'],
.mute-row input[type='checkbox'],
.cohost-first input[type='checkbox'] {
  width: 26px;
  height: 26px;
  flex: none;
  accent-color: var(--primary);
  cursor: pointer;
}
.cap-row .kicker,
.mute-row .kicker,
.perform-pick > .kicker,
.cohost-pick > .kicker {
  font-size: 15px;
}
.perform-pick,
.cohost-pick {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.seg {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.seg-btn {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 18px;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 17px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.seg-btn.on {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--line);
}
.cohost-select {
  width: 100%;
  max-width: 320px;
  padding: 13px 14px;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 17px;
  font-weight: 700;
}
.cohost-first {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
}
.cap-input {
  display: block;
  margin-top: 8px;
  width: 110px;
  padding: 9px 12px;
  border-radius: 10px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
}
.lobby-actions {
  margin-top: 18px;
}
.note {
  margin-top: 12px;
  font-size: 13px;
  color: var(--ink-soft);
}

/* write phase */
.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.stage-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  align-items: center;
}
.left {
  display: flex;
  flex-direction: column;
}
.subject {
  align-self: flex-start;
  background: var(--c3);
  color: var(--primary-ink);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 5px 15px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 14px;
}
.prompt {
  font-size: clamp(28px, 4.4vw, 52px);
  font-weight: 800;
  margin: 14px 0;
}
.building {
  font-weight: 700;
  color: var(--ink-soft);
}

/* battle arena */
.arena {
  position: absolute;
  inset: 0;
  background: #070314;
  overflow: hidden;
}
.overlays {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #f3e9ff;
  font-family: var(--font-display, sans-serif);
}
/* Only the host controls are interactive; the cards/confetti/HUD never capture
   clicks (the confetti overlay would otherwise eat the "Next battle" button). */
.overlays .ctrls {
  pointer-events: auto;
}
.hud-top {
  position: absolute;
  top: 18px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 22px;
}
.tag {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 7px 12px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  background: rgba(12, 6, 28, 0.72);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}
.round-tag {
  color: var(--gold);
  border-color: rgba(255, 210, 63, 0.45);
}
.live {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #39ff14;
}
.live .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #39ff14;
  box-shadow: 0 0 12px #39ff14;
  animation: blink 1.1s infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
.score {
  position: absolute;
  top: 62px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 14px;
}
.chip {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(12, 6, 28, 0.72);
  border: 2px solid;
  display: flex;
  gap: 8px;
  align-items: center;
  backdrop-filter: blur(6px);
}
.chip b {
  font-size: 15px;
}
.chip.p1 {
  border-color: var(--p1);
  color: var(--p1);
}
.chip.p1 .pip {
  background: var(--p1);
}
.chip.p2 {
  border-color: var(--p2);
  color: var(--p2);
}
.chip.p2 .pip {
  background: var(--p2);
}
.pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
/* opening title sequence */
.title-seq {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 20px;
  background: radial-gradient(ellipse at 50% 42%, rgba(40, 10, 70, 0.5), rgba(5, 2, 14, 0.85));
  animation: title-in 0.7s ease both;
}
.t-big {
  font-family: var(--font-display, sans-serif);
  font-weight: 900;
  font-size: clamp(40px, 12vw, 130px);
  line-height: 0.92;
  letter-spacing: 1px;
  background: linear-gradient(90deg, var(--p1), #fff 50%, var(--p2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 26px rgba(22, 224, 255, 0.4));
}
.t-vs {
  font-family: var(--font-display, sans-serif);
  font-weight: 900;
  font-size: clamp(20px, 5vw, 44px);
  color: var(--gold);
  letter-spacing: 2px;
  filter: drop-shadow(0 0 18px rgba(255, 210, 63, 0.5));
}
.t-sub {
  max-width: 36ch;
  font-size: clamp(13px, 2.6vw, 18px);
  line-height: 1.6;
  opacity: 0.85;
  letter-spacing: 0.5px;
}
@keyframes title-in {
  0% {
    opacity: 0;
    transform: scale(1.08);
    filter: blur(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}
.dn-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.btn-ico {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.stage-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;
}
.stage-card .kicker {
  font-size: clamp(13px, 3.4vw, 20px);
  letter-spacing: 3px;
  opacity: 0.85;
  margin-bottom: 10px;
  text-shadow: 0 0 14px currentColor;
  color: #f3e9ff;
}
.stage-card .big {
  font-weight: 900;
  font-size: clamp(44px, 12vw, 130px);
  line-height: 0.95;
  text-shadow: 0 0 28px currentColor;
}
.stage-card .sub {
  font-family: var(--font-body, monospace);
  font-size: clamp(13px, 3.4vw, 20px);
  margin-top: 14px;
  opacity: 0.85;
  color: #f3e9ff;
}
.pop {
  animation: pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
@keyframes pop {
  0% {
    transform: scale(1.6) rotate(-2deg);
    opacity: 0;
    filter: blur(8px);
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(0);
    filter: blur(0);
  }
}
.countnum {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-weight: 900;
  font-size: clamp(120px, 34vw, 400px);
  color: #fff;
  text-shadow: 0 0 40px rgba(255, 255, 255, 0.5);
  animation: count 0.8s ease-out both;
}
@keyframes count {
  0% {
    transform: scale(2.2);
    opacity: 0;
    filter: blur(12px);
  }
  30% {
    opacity: 1;
    filter: blur(0);
  }
  100% {
    transform: scale(0.7);
    opacity: 0;
  }
}
.perform {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  text-align: center;
}
.pf-name {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  margin-bottom: 10px;
}
.pf-name b {
  font-weight: 800;
  font-size: clamp(20px, 5vw, 38px);
  letter-spacing: 1px;
}
.live-tag {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--gold);
  border: 2px solid var(--gold);
  border-radius: 999px;
  padding: 3px 10px;
}
.driving-note {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  background: rgba(12, 6, 28, 0.72);
  color: #f3e9ff;
  font-weight: 700;
  font-size: 13px;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}
.take-back {
  background: none;
  border: none;
  color: var(--gold);
  font: inherit;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}
.verse-box {
  width: min(840px, calc(100% - 32px));
  margin: 0 auto;
  background: rgba(12, 6, 28, 0.72);
  border: 2px solid;
  border-radius: 10px;
  padding: 18px 22px;
  backdrop-filter: blur(8px);
  box-sizing: border-box;
  overflow: hidden;
}
/* One row per verse line, words wrapped with real gaps so spaces always show and
   nothing spills outside the box (a long token still breaks). */
.verse {
  display: flex;
  flex-direction: column;
  gap: 0.28em;
  font-size: clamp(15px, 3.2vw, 23px);
  line-height: 1.35;
}
.vline {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.12em 0.4em;
  max-width: 100%;
}
.verse .w {
  opacity: 0.32;
  overflow-wrap: anywhere;
  word-break: break-word;
  transition: opacity 0.14s, text-shadow 0.14s;
}
.verse .w.on {
  opacity: 1;
  text-shadow: 0 0 16px currentColor;
}
.verse .w.done {
  opacity: 0.78;
}
.vote {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 20px;
}
.vote h2 {
  font-weight: 900;
  font-size: clamp(24px, 6vw, 50px);
  letter-spacing: 2px;
  color: var(--gold);
  text-shadow: 0 0 24px rgba(255, 210, 63, 0.5);
}
.pair {
  display: flex;
  gap: clamp(14px, 4vw, 46px);
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 760px;
}
.voter {
  flex: 1 1 220px;
  min-width: 200px;
  background: rgba(12, 6, 28, 0.72);
  border: 3px solid;
  border-radius: 14px;
  padding: 18px 16px;
  text-align: center;
  backdrop-filter: blur(8px);
}
.voter.p1 {
  border-color: var(--p1);
}
.voter.p2 {
  border-color: var(--p2);
}
.voter .nm {
  font-weight: 800;
  font-size: clamp(18px, 4vw, 28px);
  letter-spacing: 1px;
}
.bar-wrap {
  height: 14px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  margin-top: 14px;
  overflow: hidden;
}
.bar {
  height: 100%;
  width: 0%;
  border-radius: 8px;
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.voter.p1 .bar {
  background: linear-gradient(90deg, #0088b3, var(--p1));
}
.voter.p2 .bar {
  background: linear-gradient(90deg, #b3005f, var(--p2));
}
.pct {
  font-weight: 800;
  font-size: 15px;
  margin-top: 8px;
}
.vote .hint {
  font-family: var(--font-body, monospace);
  font-size: 13px;
  opacity: 0.6;
  letter-spacing: 0.5px;
}
.ctrls {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.ctrl {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  background: rgba(12, 6, 28, 0.72);
  color: #f3e9ff;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}
.ctrl:hover {
  border-color: rgba(255, 255, 255, 0.5);
}

/* results */
.results-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.results-next {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 24px;
}
@media (max-width: 900px) {
  .lobby,
  .stage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
