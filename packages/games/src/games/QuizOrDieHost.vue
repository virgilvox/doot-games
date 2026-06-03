<script setup lang="ts">
/**
 * QUIZ OR DIE host: the big-screen cinematic show. A custom-flow Host that parks
 * the engine on the single `cellar` round and DRIVES the whole show over the relay:
 *   - `/x/show`            (host -> all, retained): the master show state
 *   - `/x/ans/<q>/<pid>`   (player -> host): a trivia answer
 *   - `/x/cup/<f>/<pid>`   (player -> host): a poison-chalice pick
 *   - `/x/spin|roll/<f>/<pid>` (player -> host): a wheel spin / dice roll
 *   - `/x/money/<f>/<pid>` (player -> host): a blood-money take/leave
 *   - `/x/fin/<r>/<pid>`   (player -> host): the finale "what belongs" picks
 *
 * The host is the sole authority: it holds the full (unredacted) question bank from
 * `room.config` and only ever publishes a question WITHOUT its key, then reveals
 * correctness after the clock. Real players only: a no-answer counts as wrong and is
 * dragged to the Cellar; the dead play on as ghosts and can steal a body in the
 * finale. All outcome logic is the pure, tested code in `quiz-or-die-logic.ts`.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import {
  ConfettiBurst,
  DButton,
  RoomTicket,
  RosterChips,
  announce,
  cancelSpeech,
  canSpeak,
  primeSpeech,
  warmUpSpeech,
} from '@doot-games/ui'
import { type Ref, computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CellarContent } from '../blocks/cellar/block'
import GameResults from '../runtime/GameResults.vue'
import { type HorrorAudio, createHorrorAudio } from './quiz-or-die-audio'
import { CAST_DEFS, chalice, dieFace, doll, ghostDoll, poisonTok, villain, wheelSVG } from './quiz-or-die-cast'
import {
  type Contestant,
  WHEEL_SECTORS,
  advanceByAnswers,
  applyDarkness,
  applyDeaths,
  assignCast,
  atRiskAfterQuestion,
  chaliceSetup,
  type DollShape,
  diceSetup,
  diceSurvives,
  finaleOutcome,
  findSteal,
  leaderboard,
  makeRacers,
  makeRng,
  nextDarkness,
  type Racer,
  randInt,
  redactQuestionForPublish,
  resolveBloodMoney,
  resolveChalice,
  resolveSteal,
  rollResult,
  spinResult,
} from './quiz-or-die-logic'
import type { CastView, CellarGame, ShowState } from './quiz-or-die-show'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<CellarContent | null>(() => (config.value?.rounds[0]?.content as CellarContent) ?? null)
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})

// ── Lobby controls (injected from HostRoom) ───────────────────────────────────
const roundConfig = inject<{ min: number; max: number; default: number; label: string; value: number } | null>('dootRoundConfig', null)
const roundChoices = computed(() => {
  if (!roundConfig) return []
  const out: number[] = []
  for (let n = roundConfig.min; n <= roundConfig.max; n++) out.push(n)
  return out
})
const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 10 : null
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let audio: HorrorAudio | null = null
const muted = ref(false)
const voiceMode = ref<'synth' | 'speech' | 'off'>('synth')
function cycleVoice() {
  voiceMode.value = voiceMode.value === 'synth' ? 'speech' : voiceMode.value === 'speech' ? 'off' : 'synth'
  cancelSpeech()
}
function toggleMute() {
  muted.value = !muted.value
  audio?.setMuted(muted.value)
}

// ── Host-authoritative game state ─────────────────────────────────────────────
const seed = computed(() => room.runtime.room || 'qod')
let cast: Contestant[] = []
const castMap = new Map<string, Contestant>()
let alive = new Set<string>()
let dead = new Set<string>()
const money = new Map<string, number>()
let asked = 0
let qIdx = 0
let floor = 0 // cellar visit counter (keys per-visit intents)

// the master show state (drives both the relay and the host's own visuals)
const show = ref<ShowState | null>(null)
const caption = ref<{ who: string; text: string } | null>(null)
const talking = ref(false)
const menacing = ref(false)
const villainOn = ref(false)
const villainCenter = ref(false)
const confetti = ref(false)
const flashKind = ref<'' | 'white' | 'blood'>('')
const shakeOn = ref(false)
const nowMs = ref(typeof Date !== 'undefined' ? Date.now() : 0)

// collectors for the current phase's intents
const answers = new Map<string, number | null>()
const cups = new Map<string, number>()
const spins = new Set<string>()
const takes = new Map<string, boolean>()
const finalePicks = new Map<string, number[]>()

// a "gate" the sequencer awaits; intent handlers poke it
let gate: { check: () => boolean; resolve: () => void } | null = null
const pendingWaits = new Set<() => void>()
let timers: Array<ReturnType<typeof setTimeout>> = []

function wait(ms: number): Promise<void> {
  return new Promise((res) => {
    const f = () => {
      pendingWaits.delete(f)
      res()
    }
    pendingWaits.add(f)
    timers.push(setTimeout(f, ms))
  })
}
function flushWaits() {
  for (const f of [...pendingWaits]) f()
}
function awaitInputs(check: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((res) => {
    if (check()) return res()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      gate = null
      res()
    }
    gate = { check, resolve: finish }
    timers.push(setTimeout(finish, timeoutMs))
  })
}
function pokeGate() {
  if (gate?.check()) gate.resolve()
}
function skip() {
  cancelSpeech()
  talking.value = false
  flushWaits()
  gate?.resolve()
}

// ── Show publishing ───────────────────────────────────────────────────────────
const aliveContestants = () => cast.filter((c) => alive.has(c.id))

function castView(atRisk: Set<string> = new Set()): CastView[] {
  return cast.map((c) => ({
    pid: c.id,
    name: c.name,
    shape: c.shape,
    color: c.color,
    alive: alive.has(c.id),
    atRisk: atRisk.has(c.id),
    money: money.get(c.id) ?? 0,
  }))
}

function publishShow(state: Partial<ShowState> & { phase: ShowState['phase'] }, atRisk: Set<string> = new Set()) {
  const next: ShowState = { cast: castView(atRisk), question: null, reveal: null, cellar: null, death: null, finale: null, ending: null, ...state }
  show.value = next
  room.publishExtra('show', next as unknown as RelayValue)
}

// ── Narration ─────────────────────────────────────────────────────────────────
function speak(text: string, ms: number) {
  talking.value = true
  timers.push(setTimeout(() => (talking.value = false), ms))
  if (muted.value) return
  if (voiceMode.value === 'off') return
  if (voiceMode.value === 'speech' && canSpeak()) {
    announce(text, { rate: 0.92, pitch: 0.5 })
    return
  }
  audio?.voice(text, ms)
}
async function narrate(text: string, who = 'YOUR HOST', extra = 0) {
  caption.value = { who, text }
  const words = text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  const est = Math.min(8500, Math.max(1500, words * 320 + 520))
  speak(text, est)
  await wait(est + extra)
}
function menace() {
  menacing.value = false
  timers.push(setTimeout(() => (menacing.value = true), 16))
  timers.push(setTimeout(() => (menacing.value = false), 700))
}
function flash(blood = false) {
  flashKind.value = blood ? 'blood' : 'white'
  timers.push(setTimeout(() => (flashKind.value = ''), 520))
}
function shake() {
  shakeOn.value = false
  timers.push(setTimeout(() => (shakeOn.value = true), 16))
  timers.push(setTimeout(() => (shakeOn.value = false), 520))
}

const intros = [
  'Try to look intelligent. The cameras add ten pounds and zero IQ.',
  "Eyes front, lambs. Get this one wrong and we'll get to know each other so much better.",
  'I do adore this part. The lovely little moment before someone ruins everything.',
  "Answer quickly. I've a schedule, a reputation, and a very full appointment book downstairs.",
  "Clock's running, darlings. So is the meter on your existence.",
  'Statistically, one of you is about to disappoint me. Do place your bets.',
]
const causes = ['an unfortunate beverage', 'a wheel that did not love them', 'arithmetic, of all things', 'naked greed', 'a friend with a grudge', 'the house, peckish', 'bad luck and worse timing']
const rand = <T,>(a: T[], rng = Math.random): T => a[Math.floor(rng() * a.length)] as T

// ── The sequencer ─────────────────────────────────────────────────────────────
const ANSWER_MS = computed(() => (content.value?.answerTime ?? 12) * 1000)

async function runShow() {
  villainOn.value = true
  villainCenter.value = false // the host lurks in the corner; the big logo owns center stage
  audio?.setMode('lobby')
  publishShow({ phase: 'intro' })
  await wait(700)
  await narrate("Goooood evening, and welcome to the only game show with a body count. I'm your host, though by the end, you may have other names for me.", 'YOUR HOST', 150)
  await narrate("The premise is simple, my darlings: I ask, you answer. Answer well and you keep your seat. Answer poorly, and you'll see what I keep in the cellar.", 'THE RULES', 150)
  menace()
  await narrate('Lose down there and you spend the rest of the night as a ghost, quietly hoping your friends come join you. Now then. Let us play Quiz, or Die.', 'THE RULES', 150)
  audio?.setMode('play')
  villainCenter.value = false
  caption.value = null

  const bank = content.value?.questions ?? []
  const qPer = content.value?.qPerGame ?? 7

  while (bank.length) {
    const atRisk = await question(bank)
    if (atRisk.length) await cellar(atRisk)
    asked++
    if (alive.size === 0) break
    if (alive.size <= 1 && asked >= 3) break
    if (asked >= qPer) break
    qIdx++
    await wait(500)
  }
  await finale()
}

async function question(bank: CellarContent['questions']): Promise<string[]> {
  const Q = bank[qIdx % bank.length]
  if (!Q) return []
  answers.clear()
  const deadline = nowMs.value + ANSWER_MS.value
  // redactQuestionForPublish strips the correct index: the answer never rides the relay
  // before the reveal (the host scores from its local full config).
  publishShow({ phase: 'question', question: { ...redactQuestionForPublish(Q, qIdx), deadline } })
  audio?.sfx.whoosh()
  villainOn.value = false
  // a host quip during the answer window (overlaps the clock, never blocks)
  const introLine = rand(intros)
  caption.value = { who: 'YOUR HOST', text: introLine }
  speak(introLine, 2600)
  await wait(450)
  // collect answers from the living until all in or the clock runs out
  await awaitInputs(() => aliveContestants().every((c) => answers.has(c.id)), ANSWER_MS.value + 600)
  caption.value = null
  audio?.sfx.reveal()
  // reveal
  const atRisk = atRiskAfterQuestion(alive, answers, Q.c)
  for (const c of cast) {
    if (alive.has(c.id) && answers.get(c.id) === Q.c) money.set(c.id, (money.get(c.id) ?? 0) + 1000)
  }
  publishShow({ phase: 'reveal', question: { ...redactQuestionForPublish(Q, qIdx), deadline }, reveal: { correct: Q.c, atRisk } }, new Set(atRisk))
  audio?.sfx.sting()
  flash()
  villainOn.value = true
  await wait(900)
  if (atRisk.length === 0) {
    await narrate(rand(['All correct. How thoroughly unsatisfying. The cellar gets so lonely.', 'Not a single casualty. My therapist will hear about this.', 'Flawless. Disgusting. I will allow it, for now.']), 'YOUR HOST', 100)
    caption.value = null
    return []
  }
  audio?.sfx.wrong()
  const names = atRisk.map((p) => castMap.get(p)?.name ?? 'someone').join(', ')
  await narrate(`Wrong. The answer was "${Q.a[Q.c]}." ${names}, to the cellar. Chop chop. Chop being the operative word.`, 'YOUR HOST', 120)
  caption.value = null
  return atRisk
}

const cellarGames: CellarGame[] = ['chalice', 'wheel', 'dice', 'money']
let lastCellar: CellarGame | null = null

async function cellar(atRisk: string[]) {
  floor++
  audio?.setMode('tension')
  // A neutral "entering the Cellar" beat before a minigame is chosen, so at-risk
  // phones don't flash a half-built game (e.g. an empty chalice) during the intro.
  publishShow({ phase: 'cellar', cellar: { game: 'chalice', floor, atRisk, step: 'intro' } }, new Set(atRisk))
  villainOn.value = true
  await narrate(rand(['Welcome to the cellar, where the decor is mood lighting and regret.', 'Down we go. Mind the stains; some are paint. I will not say which.', 'Time for a little game. Do try not to bleed on the good rug.']), 'THE CELLAR', 100)
  villainOn.value = false
  // pick a minigame (not the same as last time, when possible)
  let pool = cellarGames.slice()
  if (atRisk.length < 2) pool = pool.filter((g) => g !== 'money') // blood money wants a crowd
  const rng = makeRng(`${seed.value}:floor:${floor}`)
  let game = pool[randInt(rng, 0, pool.length - 1)] as CellarGame
  if (game === lastCellar && pool.length > 1) game = pool.filter((g) => g !== lastCellar)[0] as CellarGame
  lastCellar = game

  let dying: string[] = []
  if (game === 'chalice') dying = await kfChalice(atRisk)
  else if (game === 'wheel') dying = await kfWheel(atRisk)
  else if (game === 'dice') dying = await kfDice(atRisk)
  else dying = await kfMoney(atRisk)

  if (dying.length === 0) {
    audio?.sfx.reveal()
    await narrate('Survived. All of you. The cellar is terribly disappointed. So am I.', 'YOUR HOST', 100)
  } else {
    for (const pid of dying) await kill(pid)
  }
  audio?.setMode('play')
  caption.value = null
  await wait(350)
}

// ── Poison Chalice ──
async function kfChalice(atRisk: string[]): Promise<string[]> {
  const { cups: nCups, poison } = chaliceSetup(atRisk.length, `${seed.value}:f${floor}`)
  cups.clear()
  const deadline = nowMs.value + 9000
  publishShow({ phase: 'cellar', cellar: { game: 'chalice', floor, atRisk, step: 'choose', cups: nCups, deadline } }, new Set(atRisk))
  await narrate('A little aperitif. One of these cups says goodnight. Bottoms up, and possibly bottoms down.', 'THE CELLAR', 80)
  await awaitInputs(() => atRisk.every((p) => cups.has(p)), 9600)
  // auto-pick for anyone who stalled
  const r = makeRng(`${seed.value}:f${floor}:autocup`)
  for (const p of atRisk) if (!cups.has(p)) cups.set(p, randInt(r, 0, nCups - 1))
  audio?.sfx.whoosh()
  publishShow({ phase: 'cellar', cellar: { game: 'chalice', floor, atRisk, step: 'reveal', cups: nCups, poison } }, new Set(atRisk))
  await wait(900)
  const dying = resolveChalice(cups, poison)
  for (const _ of dying) audio?.sfx.gulp()
  await wait(700)
  return dying
}

// ── Reaper's Wheel (sequential) ──
async function kfWheel(atRisk: string[]): Promise<string[]> {
  const dying: string[] = []
  for (const pid of atRisk) {
    spins.clear()
    const deadline = nowMs.value + 8000
    publishShow({ phase: 'cellar', cellar: { game: 'wheel', floor, atRisk, step: 'choose', queue: atRisk, activePid: pid, deadline } }, new Set(atRisk))
    await narrate(`${castMap.get(pid)?.name ?? 'You'}, give the wheel a spin. Five-to-one against you, which I think is terribly sporting of me.`, 'THE CELLAR', 40)
    await awaitInputs(() => spins.has(pid), 8600)
    audio?.sfx.spin()
    const { death } = spinResult(`${seed.value}:f${floor}:${pid}`)
    await wait(5200)
    if (death) {
      dying.push(pid)
      audio?.sfx.wrong()
    } else audio?.sfx.correct()
    await wait(500)
  }
  return dying
}

// ── Bone Dice (sequential) ──
async function kfDice(atRisk: string[]): Promise<string[]> {
  const setup = diceSetup(`${seed.value}:f${floor}`)
  const dying: string[] = []
  audio?.sfx.diceroll()
  await narrate(`The bones show ${setup.target}. Roll ${setup.higher ? 'higher' : 'lower'}, or stay down here with the others.`, 'THE CELLAR', 60)
  for (const pid of atRisk) {
    spins.clear()
    const deadline = nowMs.value + 7500
    publishShow({ phase: 'cellar', cellar: { game: 'dice', floor, atRisk, step: 'choose', queue: atRisk, activePid: pid, house: setup.house, target: setup.target, higher: setup.higher, deadline } }, new Set(atRisk))
    await awaitInputs(() => spins.has(pid), 8000)
    audio?.sfx.diceroll()
    const { sum } = rollResult(`${seed.value}:f${floor}:${pid}`)
    await wait(900)
    if (!diceSurvives(sum, setup.target, setup.higher)) {
      dying.push(pid)
      audio?.sfx.wrong()
    } else audio?.sfx.correct()
    await wait(450)
  }
  return dying
}

// ── Blood Money ──
async function kfMoney(atRisk: string[]): Promise<string[]> {
  takes.clear()
  const deadline = nowMs.value + 9000
  publishShow({ phase: 'cellar', cellar: { game: 'money', floor, atRisk, step: 'choose', deadline } }, new Set(atRisk))
  await narrate('Cash on the floor and a catch in the air. Take it, but if even one of you grabs, everyone who walked pays. And if you all grab? Then it is a party.', 'THE CELLAR', 80)
  await awaitInputs(() => atRisk.every((p) => takes.has(p)), 9600)
  const { dying, payouts } = resolveBloodMoney(takes, atRisk)
  for (const [pid, amt] of payouts) money.set(pid, (money.get(pid) ?? 0) + amt)
  audio?.sfx.reveal()
  publishShow({ phase: 'cellar', cellar: { game: 'money', floor, atRisk, step: 'reveal' } }, new Set(atRisk))
  await wait(900)
  if (dying.length === 0) await narrate('Nobody touched it? How disciplined. How dull. You all live, this once.', 'YOUR HOST', 60)
  else if (dying.length === atRisk.length) await narrate('Every last hand in the pot. Greedy little things. Everyone settles up.', 'YOUR HOST', 60)
  else await narrate('Someone could not resist. So everyone who could pays the difference.', 'YOUR HOST', 60)
  return dying
}

async function kill(pid: string) {
  const c = castMap.get(pid)
  const cause = rand(causes)
  publishShow({ phase: 'death', death: { pid, name: c?.name ?? 'Someone', you: cause } })
  await wait(450)
  audio?.sfx.death()
  const mode = randInt(makeRng(`${seed.value}:death:${pid}:${floor}`), 0, 2)
  if (mode === 0) {
    audio?.sfx.explode()
    flash(true)
    shake()
  } else if (mode === 1) {
    audio?.sfx.slice()
    flash()
    shake()
  } else flash()
  const next = applyDeaths(alive, dead, [pid])
  alive = next.alive
  dead = next.dead
  await wait(800)
  audio?.ghostWail(0.6)
  villainOn.value = true
  await narrate(rand([`And ${c?.name ?? 'they'} take their final bow. No encore, I checked.`, `Goodnight, ${c?.name ?? 'friend'}. You were a delight to cancel.`, 'One down. The leaderboard of the living grows pleasingly short.']), 'YOUR HOST', 80)
  caption.value = null
}

// ── The Escape (finale) ──
async function finale() {
  audio?.setMode('final')
  // revive the richest corpse if the house is empty, for one last run (the mockup move)
  if (alive.size === 0 && dead.size > 0) {
    const richest = [...dead].sort((a, b) => (money.get(b) ?? 0) - (money.get(a) ?? 0))[0] as string
    villainOn.value = true
    await narrate('All dead already? I cannot run a finale to an empty house. The richest corpse gets one more heartbeat. Do not waste it.', 'YOUR HOST', 120)
    const back = applyDeaths(dead, alive, [richest]) // move richest out of dead...
    dead = back.alive
    alive = new Set([richest, ...alive])
  }
  if (alive.size === 0) {
    await gameOver()
    return
  }

  const finalCats = content.value?.finalCats ?? []
  let racers = makeRacers(cast, alive).map((r) => withArt(r))
  let darkness = 0
  villainOn.value = false
  publishShow({ phase: 'finale', finale: { racers, darkness, round: 0, cat: '', opts: [], deadline: 0 } })
  await narrate('And now, the finale: the long walk to the exit. Answer to advance. Ghosts, if you fancy a living body, do help yourselves.', 'THE ESCAPE', 150)

  let winner = false
  for (let round = 1; round <= 6 && !winner; round++) {
    const fc = finalCats[(round - 1) % Math.max(1, finalCats.length)]
    if (!fc) break
    const oks = fc.opts.filter((o) => o.ok)
    const nos = fc.opts.filter((o) => !o.ok)
    const r = makeRng(`${seed.value}:fin:${round}`)
    const chosen = [rand(oks, r), ...(nos.length ? [rand(nos, r)] : [])]
    const restPool = fc.opts.filter((o) => !chosen.includes(o))
    while (chosen.length < 3 && restPool.length) chosen.push(restPool.splice(randInt(r, 0, restPool.length - 1), 1)[0] as (typeof restPool)[number])
    const opts = chosen.sort(() => r() - 0.5)
    const okFlags = opts.map((o) => o.ok)

    finalePicks.clear()
    const deadline = nowMs.value + 8000
    const racing = racers.filter((x) => !x.out).map((x) => x.pid)
    publishShow({ phase: 'finale', finale: { racers, darkness, round, cat: fc.cat, opts: opts.map((o) => ({ t: o.t })), deadline } })
    audio?.sfx.whoosh()
    await awaitInputs(() => racing.every((p) => finalePicks.has(p)), 8400)
    // reveal
    publishShow({ phase: 'finale', finale: { racers, darkness, round, cat: fc.cat, opts: opts.map((o) => ({ t: o.t })), reveal: true, ok: okFlags, deadline } })
    audio?.sfx.reveal()
    await wait(800)
    // score: a racer earns one step per option they judged correctly
    const correctBy = new Map<string, number>()
    for (const pid of racing) {
      const picks = new Set(finalePicks.get(pid) ?? [])
      let correct = 0
      okFlags.forEach((ok, i) => {
        if (picks.has(i) === ok) correct++
      })
      correctBy.set(pid, correct)
      money.set(pid, (money.get(pid) ?? 0) + correct * (alive.has(pid) ? 500 : 300))
    }
    racers = advanceByAnswers(racers, correctBy).map((x) => withArt(x))
    publishShow({ phase: 'finale', finale: { racers, darkness, round, cat: fc.cat, opts: opts.map((o) => ({ t: o.t })), reveal: true, ok: okFlags, deadline } })
    audio?.sfx.whoosh()
    await wait(900)

    // body steal: at most ONE per round (a ghost that caught a living body takes
    // it). One-per-round is deliberate, resolving every catch would let the swapped
    // pair, now level, steal back and forth forever.
    const steal = findSteal(racers)
    if (steal) {
      const [gPid, tPid] = steal
      const after = resolveSteal(racers, gPid, tPid)
      if (after) {
        racers = after.map((x) => withArt(x))
        // sync the alive/dead sets to the swap
        alive.delete(tPid)
        alive.add(gPid)
        dead.add(tPid)
        dead.delete(gPid)
        audio?.sfx.bodysteal()
        flash(true)
        publishShow({ phase: 'finale', finale: { racers, darkness, round, cat: fc.cat, opts: [], deadline } })
        await narrate(`${castMap.get(gPid)?.name ?? 'A ghost'} just helped themselves to ${castMap.get(tPid)?.name ?? 'a'} body! The dead do not knock, darling.`, 'THE ESCAPE', 100)
      }
    }

    // darkness after round 3
    if (round >= 3) {
      darkness = nextDarkness(darkness, 0.14)
      const dk = applyDarkness(racers, darkness)
      racers = dk.racers.map((x) => withArt(x))
      if (dk.consumed.length) {
        audio?.sfx.death()
        for (const pid of dk.consumed) {
          alive.delete(pid)
          dead.add(pid)
        }
        if (darkness > 0 && round === 3) await narrate('Ah, here it comes, the dark. Fall behind, and it tucks you in. Permanently.', 'THE ESCAPE', 80)
      }
      publishShow({ phase: 'finale', finale: { racers, darkness, round, cat: fc.cat, opts: [], deadline } })
      await wait(800)
    }

    const out = finaleOutcome(racers)
    if (out.survivors.length) {
      winner = true
      break
    }
    if (!racers.some((x) => x.alive && !x.out)) break
    await wait(400)
  }

  const result = finaleOutcome(racers)
  if (result.result === 'won') {
    const champ = result.survivors[0] ?? racers.filter((x) => x.alive && !x.out).sort((a, b) => b.x - a.x)[0]?.pid
    await win(champ)
  } else await gameOver()
}

/** Attach doll art metadata to a racer for the finale view. */
function withArt(r: Racer): Racer & { shape: DollShape; color: string } {
  const c = castMap.get(r.pid)
  return { ...r, shape: c?.shape ?? 'blob', color: c?.color ?? '#d98aa0' }
}

async function win(pid?: string) {
  audio?.victory()
  villainOn.value = true
  const c = pid ? castMap.get(pid) : undefined
  publishShow({ phase: 'ending', ending: { result: 'won', survivors: pid ? [pid] : [] } })
  confetti.value = true
  await narrate(`${c?.name ?? 'Someone'} is out the door. Alive. I am not angry, just deeply, professionally disappointed. Do come again. You will.`, 'YOUR HOST', 150)
  menace()
  finishGame('won', pid)
}

async function gameOver() {
  audio?.sfx.gameover()
  flash(true)
  villainOn.value = true
  publishShow({ phase: 'ending', ending: { result: 'wiped', survivors: [] } })
  await narrate('Nobody made it out. Nobody. Oh, I could weep, with joy. Best ratings all season. The house ate well tonight, and so, my darlings, did I.', 'YOUR HOST', 150)
  menace()
  finishGame('wiped')
}

function finishGame(result: 'won' | 'wiped', champ?: string) {
  const rows = cast.map((c) => ({
    id: c.id,
    name: c.name,
    money: money.get(c.id) ?? 0,
    escaped: c.id === champ,
    alive: alive.has(c.id),
  }))
  const board = leaderboard(rows)
  const summary: StandardResults = {
    headline: result === 'won' && champ ? `${castMap.get(champ)?.name ?? 'Someone'} escaped the house` : 'No survivors. The house wins.',
    leaderboard: board.map((r) => ({ id: r.id, name: r.name, score: r.score, detail: r.detail })),
    stats: [
      { label: 'Questions asked', value: asked },
      { label: 'Survivors', value: alive.size },
    ],
  }
  room.host.finish(summary as unknown as RelayValue)
}

// ── Start / lifecycle ─────────────────────────────────────────────────────────
function startGame() {
  // freeze the contestant roster + prime audio inside this user gesture
  cast = assignCast(room.players.value.map((p) => ({ id: p.id, name: p.name })))
  for (const c of cast) castMap.set(c.id, c)
  alive = new Set(cast.map((c) => c.id))
  dead = new Set()
  for (const c of cast) money.set(c.id, 0)
  audio = createHorrorAudio()
  void audio.start()
  audio.setMuted(muted.value)
  if (voiceMode.value === 'speech') primeSpeech()
  room.host.start()
  void runShow()
}
function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

// clock + intent handlers
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  warmUpSpeech()
  clock = setInterval(() => {
    nowMs.value = Date.now()
    audio?.resume()
  }, 250)

  room.onExtra('ans/*/*', (v, key) => {
    const [, q, pid] = key.split('/')
    if (show.value?.phase !== 'question' || Number(q) !== qIdx) return
    if (!pid || !alive.has(pid) || answers.has(pid)) return
    const choice = (v as { choice?: number } | null)?.choice
    answers.set(pid, typeof choice === 'number' ? choice : null)
    audio?.sfx.select()
    pokeGate()
  })
  room.onExtra('cup/*/*', (v, key) => {
    const [, f, pid] = key.split('/')
    if (Number(f) !== floor || !pid || cups.has(pid)) return
    if (show.value?.cellar?.game !== 'chalice' || !show.value.cellar.atRisk.includes(pid)) return
    const pick = (v as { pick?: number } | null)?.pick
    if (typeof pick !== 'number') return
    cups.set(pid, pick)
    audio?.sfx.select()
    pokeGate()
  })
  const onSpinRoll = (_v: unknown, key: string) => {
    const [, f, pid] = key.split('/')
    if (Number(f) !== floor || !pid) return
    const active = show.value?.cellar?.activePid
    if (active !== pid || spins.has(pid)) return
    spins.add(pid)
    pokeGate()
  }
  room.onExtra('spin/*/*', onSpinRoll)
  room.onExtra('roll/*/*', onSpinRoll)
  room.onExtra('money/*/*', (v, key) => {
    const [, f, pid] = key.split('/')
    if (Number(f) !== floor || !pid || takes.has(pid)) return
    if (show.value?.cellar?.game !== 'money' || !show.value.cellar.atRisk.includes(pid)) return
    takes.set(pid, (v as { take?: boolean } | null)?.take === true)
    audio?.sfx.select()
    pokeGate()
  })
  room.onExtra('fin/*/*', (v, key) => {
    const [, r, pid] = key.split('/')
    if (show.value?.phase !== 'finale' || Number(r) !== show.value.finale?.round || !pid) return
    if (finalePicks.has(pid)) return
    const picks = (v as { picks?: number[] } | null)?.picks
    if (!Array.isArray(picks)) return
    finalePicks.set(pid, picks.filter((n) => typeof n === 'number'))
    audio?.sfx.select()
    pokeGate()
  })
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  for (const t of timers) clearTimeout(t)
  timers = []
  cancelSpeech()
  audio?.stop()
})

// ── Host visual helpers ───────────────────────────────────────────────────────
const remaining = computed(() => {
  const d = show.value?.question?.deadline ?? show.value?.cellar?.deadline ?? show.value?.finale?.deadline
  if (!d) return null
  return Math.max(0, Math.ceil((d - nowMs.value) / 1000))
})
const marquee = computed(() => {
  const s = show.value
  if (!s || s.phase === 'intro') return ''
  if (s.phase === 'question' || s.phase === 'reveal') return s.question?.cat ?? ''
  if (s.phase === 'cellar' || s.phase === 'death') return 'THE CELLAR'
  if (s.phase === 'finale') return 'THE ESCAPE'
  return ''
})
const galleryReveal = computed(() => (show.value?.phase === 'reveal' ? show.value.reveal : null))
function pickChips(optIndex: number) {
  // who (alive) answered this option, shown at reveal
  if (show.value?.phase !== 'reveal') return [] as CastView[]
  const ans = answers
  return (show.value.cast ?? []).filter((c) => ans.get(c.pid) === optIndex)
}
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="qod-lobby qod-root">
    <section class="panel ticket-card">
      <RoomTicket :code="room.runtime.room" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="roster-head">
        <div class="kicker">The condemned</div>
        <span class="count mono">{{ room.players.value.length }} checked in</span>
      </div>
      <RosterChips :players="room.players.value" />
      <div v-if="roundConfig" class="round-pick">
        <span class="kicker">{{ roundConfig.label }}</span>
        <div class="round-opts" role="group" :aria-label="roundConfig.label">
          <button v-for="n in roundChoices" :key="n" type="button" class="round-opt" :class="{ on: roundConfig.value === n }" :aria-pressed="roundConfig.value === n" @click="roundConfig.value = n">{{ n }}</button>
        </div>
      </div>
      <div class="cap-pick">
        <label class="cap-row">
          <input type="checkbox" :checked="playerCap != null" @change="toggleCap(($event.target as HTMLInputElement).checked)" />
          <span class="kicker">Limit how many can join</span>
        </label>
      </div>
      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="room.players.value.length < 2" @click="startGame">Enter the house</DButton>
      </div>
      <p class="note">Answer trivia on your phone. Get it wrong and you are dragged to the Cellar for a game of chance. The dead play on as ghosts. Best experienced loud. You need at least two players.</p>
    </section>
  </div>

  <!-- RESULTS -->
  <div v-else-if="room.phase.value === 'results' && room.results.value" class="qod-results qod-root">
    <GameResults :results="room.results.value as any" />
    <div class="results-next">
      <button type="button" class="btn btn-primary btn-lg" @click="playAgain">Run it again</button>
      <a class="btn btn-ghost btn-lg" href="/explore">Pick another game</a>
    </div>
  </div>

  <!-- THE SHOW -->
  <div v-else class="qod-stage qod-root" :class="{ shake: shakeOn }">
    <div class="qod-defs" v-html="CAST_DEFS" />

    <!-- gallery (top band) -->
    <div class="qod-gallery">
      <div v-for="p in show?.cast ?? []" :key="p.pid" class="gp" :class="{ dead: !p.alive, atrisk: p.atRisk && p.alive }">
        <div class="gname" :style="{ color: p.alive ? p.color : '#9fb6b2' }">{{ p.name }}</div>
        <div class="gmoney mono">${{ p.money }}</div>
        <div class="gdoll" v-html="p.alive ? doll(p.shape, p.color) : ghostDoll(p.color)" />
      </div>
    </div>

    <!-- title / marquee band (its own row: never overlaps the gallery or content) -->
    <div class="qod-marquee">
      <span v-if="marquee" class="marq-cat">{{ marquee }}</span>
      <span v-else-if="show?.phase !== 'intro'" class="marq-logo">QUIZ<i>OR DIE</i></span>
    </div>

    <!-- content -->
    <div class="qod-content">
      <!-- intro -->
      <div v-if="show?.phase === 'intro'" class="intro">
        <div class="logo-big">QUIZ<i>OR DIE</i></div>
        <div class="sub">room {{ room.runtime.room }} · {{ (show?.cast ?? []).length }} contestants checked in</div>
      </div>

      <!-- question / reveal -->
      <template v-else-if="show?.phase === 'question' || show?.phase === 'reveal'">
        <h2 class="q-title">{{ show?.question?.q }}</h2>
        <div class="answers">
          <div v-for="(opt, i) in show?.question?.a ?? []" :key="i" class="ans-wrap">
            <div class="ans" :class="{ correct: galleryReveal && galleryReveal.correct === i, wrong: galleryReveal && galleryReveal.correct !== i && pickChips(i).length }" :data-n="i + 1">{{ opt }}</div>
            <div class="picks">
              <span v-for="c in pickChips(i)" :key="c.pid" class="pchip" :style="{ background: c.color }">{{ c.name.slice(0, 2) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- cellar minigames -->
      <template v-else-if="show?.phase === 'cellar' && show?.cellar">
        <!-- chalice -->
        <template v-if="show.cellar.game === 'chalice'">
          <h2 class="q-title small">Last Call</h2>
          <div class="cups">
            <div v-for="i in show.cellar.cups ?? 0" :key="i" class="cup" :class="{ poisoned: show.cellar.poison?.includes(i - 1) }">
              <div v-if="show.cellar.poison?.includes(i - 1)" class="tok" v-html="poisonTok()" />
              <div v-html="chalice(i - 1)" />
            </div>
          </div>
        </template>
        <!-- wheel -->
        <template v-else-if="show.cellar.game === 'wheel'">
          <h2 class="q-title small">The Reaper's Wheel</h2>
          <div class="wheelwrap">
            <div class="wheel-ptr" />
            <div class="wheel" :class="{ spun: show.cellar.activePid }" v-html="wheelSVG(WHEEL_SECTORS)" />
            <div class="wheel-hub" />
          </div>
          <div class="label">{{ castMap.get(show.cellar.activePid ?? '')?.name ?? '' }} spins…</div>
        </template>
        <!-- dice -->
        <template v-else-if="show.cellar.game === 'dice'">
          <h2 class="q-title small">Bone Dice</h2>
          <div class="dicerow">
            <div v-for="(n, i) in show.cellar.house ?? []" :key="i" class="die" v-html="dieFace(n)" />
          </div>
          <div class="label">Total {{ show.cellar.target }} · roll {{ show.cellar.higher ? 'HIGHER' : 'LOWER' }} to live</div>
        </template>
        <!-- money -->
        <template v-else>
          <h2 class="q-title small">Blood Money</h2>
          <div class="cash mono">$ $ $</div>
          <div class="label">Take it… and you might be the only one who does.</div>
        </template>
      </template>

      <!-- death -->
      <div v-else-if="show?.phase === 'death' && show?.death" class="death">
        <div class="death-doll" v-html="ghostDoll(castMap.get(show.death.pid)?.color)" />
        <div class="big-blood">{{ show.death.name.toUpperCase() }} DIED</div>
        <div class="label">cause of death: {{ show.death.you }}</div>
      </div>

      <!-- finale -->
      <template v-else-if="show?.phase === 'finale' && show?.finale">
        <div v-if="show.finale.cat" class="fin-head">
          <div class="big-blood small">{{ show.finale.cat }}</div>
          <div class="fin-opts">
            <span v-for="(o, i) in show.finale.opts" :key="i" class="ans" :class="{ correct: show.finale.reveal && show.finale.ok?.[i], wrong: show.finale.reveal && !show.finale.ok?.[i] }">{{ o.t }}</span>
          </div>
          <div class="subtle">tap every answer that belongs</div>
        </div>
        <div class="lane">
          <div class="exitdoor">EXIT</div>
          <div class="dark" :style="{ width: Math.min(90, (show.finale.darkness * 100)) + '%' }" />
          <div class="track">
            <div v-for="r in show.finale.racers" :key="r.pid" class="runner" :class="{ out: r.out }">
              <div class="rail" />
              <div class="tok" :style="{ left: (4 + r.x * 86) + '%' }">
                <div class="tok-doll" v-html="r.alive ? doll(castMap.get(r.pid)?.shape ?? 'blob', castMap.get(r.pid)?.color ?? '#d98aa0') : ghostDoll(castMap.get(r.pid)?.color)" />
                <span class="tok-name" :style="{ color: castMap.get(r.pid)?.color }">{{ r.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ending -->
      <div v-else-if="show?.phase === 'ending'" class="ending">
        <div v-if="show?.ending?.result === 'won'" class="logo-big amber">{{ castMap.get(show?.ending?.survivors?.[0] ?? '')?.name?.toUpperCase() ?? 'SOMEONE' }} ESCAPED</div>
        <div v-else class="big-blood">NO SURVIVORS</div>
        <div class="label">{{ show?.ending?.result === 'won' ? 'the sole survivor walks free' : 'the house always wins' }}</div>
      </div>

      <!-- clock -->
      <div v-if="remaining != null" class="clock" :class="{ low: remaining <= 5 }">
        <div class="face"><span class="num mono">{{ remaining }}</span></div>
      </div>

      <!-- villain host (confined to the content cell, bottom-right) -->
      <div class="villain" :class="{ on: villainOn, center: villainCenter, talking, menace: menacing }" v-html="villain()" />
    </div>

    <!-- caption band -->
    <div class="qod-caption" :class="{ show: !!caption }">
      <span class="who">{{ caption?.who }}</span>
      <span class="txt">{{ caption?.text }}</span>
    </div>

    <!-- host controls -->
    <div class="qod-controls">
      <button type="button" class="ctl" @click="skip">Skip ▸</button>
      <button type="button" class="ctl" :class="{ off: muted }" @click="toggleMute">{{ muted ? 'Muted' : 'Sound' }}</button>
      <button type="button" class="ctl" @click="cycleVoice">Voice: {{ voiceMode }}</button>
    </div>

    <div class="flash" :class="flashKind" />
    <ConfettiBurst v-if="confetti" />
  </div>
</template>

<style scoped>
/* ── horror palette, scoped to the game ── */
.qod-root {
  --blood: #c41f1f;
  --blood2: #e23b3b;
  --blood-deep: #7a0f0f;
  --amber: #e8901f;
  --amber2: #f4b13a;
  --ghost: #86e0da;
  --ghost2: #bdf4ef;
  --bone: #efe9d8;
  --ink-h: #e9e3d2;
  --font-horror-disp: 'Creepster', 'Special Elite', cursive;
  --font-horror-gore: 'Nosifer', 'Creepster', cursive;
  --font-horror-type: 'Special Elite', 'Courier New', monospace;
  --font-horror-digi: 'VT323', monospace;
  flex: 1;
  min-height: 0;
}

/* ── lobby / results reuse the platform theme ── */
.qod-lobby {
  display: grid;
  grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 760px) {
  .qod-lobby { grid-template-columns: 1fr; }
}
.panel { background: var(--surface); border: var(--bd) solid var(--line); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow); }
.roster-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.kicker { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); }
.count { color: var(--mute); font-size: 13px; }
.round-pick, .cap-pick { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.round-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.round-opt { font: inherit; font-weight: 700; padding: 8px 14px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface-2); color: var(--ink); cursor: pointer; }
.round-opt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, var(--surface-2)); }
.cap-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.lobby-actions { margin-top: 18px; }
.note { margin-top: 12px; color: var(--ink-soft); font-size: 14px; line-height: 1.5; }
.qod-results { display: flex; flex-direction: column; gap: 18px; }
.results-next { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* ── the show: a grid whose named rows cannot overlap ── */
.qod-stage {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas: 'roster' 'marquee' 'content' 'caption';
  gap: 8px;
  background: radial-gradient(120% 90% at 50% 16%, #16161d 0%, #0b0b11 55%, #050507 100%);
  border-radius: var(--radius-lg);
  overflow: hidden;
  color: var(--ink-h);
  padding: 12px 14px;
  min-height: 70vh;
}
.qod-defs { position: absolute; width: 0; height: 0; }

.qod-gallery {
  grid-area: roster;
  display: flex;
  justify-content: center;
  gap: clamp(6px, 2vw, 26px);
  height: clamp(74px, 13vh, 120px);
  overflow: hidden;
}
.gp { display: flex; flex-direction: column; align-items: center; width: clamp(46px, 8vw, 92px); transition: opacity 0.4s, filter 0.4s, transform 0.4s; }
.gp.dead { filter: grayscale(1) brightness(0.7); }
.gp.atrisk { transform: translateY(2px) scale(1.06); }
.gp.atrisk .gname { color: var(--blood2); text-shadow: 0 0 10px var(--blood); }
.gname { font-family: var(--font-horror-type); font-size: clamp(9px, 1.2vw, 14px); white-space: nowrap; text-shadow: 0 1px 3px #000; }
.gmoney { font-family: var(--font-horror-digi); font-size: clamp(10px, 1.3vw, 16px); color: var(--amber2); line-height: 0.9; }
.gdoll { width: 100%; aspect-ratio: 1/1; }
.gdoll :deep(svg) { width: 100%; height: 100%; overflow: visible; }

.qod-marquee { grid-area: marquee; text-align: center; min-height: 1.4em; display: flex; align-items: center; justify-content: center; }
.marq-cat { font-family: var(--font-horror-gore); color: var(--amber2); letter-spacing: 3px; font-size: clamp(13px, 2.2vw, 26px); text-shadow: 0 0 14px rgba(0, 0, 0, 0.8); }
.marq-logo { font-family: var(--font-horror-disp); color: var(--amber); font-size: clamp(20px, 3vw, 40px); letter-spacing: 1px; }
.marq-logo i { font-style: normal; font-family: var(--font-horror-gore); color: var(--blood2); margin-left: 0.4em; font-size: 0.7em; }

.qod-content { grid-area: content; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: clamp(8px, 1.6vh, 18px); padding: 4px clamp(10px, 4%, 60px); min-height: 0; }

.intro, .ending { display: flex; flex-direction: column; align-items: center; gap: 1vh; }
.logo-big { font-family: var(--font-horror-disp); color: var(--amber); font-size: clamp(40px, 9vw, 120px); line-height: 0.9; letter-spacing: 2px; text-shadow: 0 0 30px rgba(232, 144, 31, 0.35), 0 5px 0 #6e3d08, 0 6px 14px #000; }
.logo-big.amber { color: var(--amber2); }
.logo-big i { display: block; font-style: normal; font-family: var(--font-horror-gore); color: var(--blood2); font-size: 0.5em; text-shadow: 0 0 30px var(--blood); }
.sub { font-family: var(--font-horror-type); color: var(--ghost2); font-size: clamp(11px, 1.4vw, 17px); letter-spacing: 1px; }

.q-title { font-family: var(--font-horror-type); color: var(--bone); font-size: clamp(18px, 3.2vw, 42px); line-height: 1.18; text-shadow: 0 3px 10px #000; max-width: 18em; }
.q-title.small { font-size: clamp(20px, 3.4vw, 40px); }
.big-blood { font-family: var(--font-horror-gore); color: var(--blood2); font-size: clamp(26px, 6vw, 80px); line-height: 1; text-shadow: 0 0 36px var(--blood), 0 4px 14px #000; }
.big-blood.small { font-size: clamp(16px, 2.8vw, 34px); }
.label { font-family: var(--font-horror-gore); color: var(--amber2); letter-spacing: 3px; font-size: clamp(11px, 1.5vw, 18px); text-shadow: 0 0 14px rgba(0, 0, 0, 0.8); }
.subtle { font-family: var(--font-horror-type); color: var(--ink-dim, #b8b2a2); font-size: clamp(11px, 1.4vw, 16px); }

.answers { display: grid; gap: clamp(7px, 1.2vw, 14px); width: min(86%, 720px); }
.ans-wrap { position: relative; }
.ans {
  position: relative; display: flex; align-items: center; gap: 12px;
  padding: clamp(7px, 1.3vh, 14px) clamp(12px, 2vw, 22px);
  background: linear-gradient(180deg, #e7ddc4, #cdbf9f); color: #161208;
  font-family: var(--font-horror-type); font-size: clamp(13px, 1.9vw, 23px); text-align: left;
  border-radius: 4px; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.55);
}
.ans[data-n]::before { content: attr(data-n); display: flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; font-family: var(--font-horror-digi); color: #fff; background: #444; border-radius: 3px; }
.ans.correct { background: linear-gradient(180deg, #bfe6a8, #8fc873); box-shadow: 0 0 30px #6fd17f; }
.ans.wrong { background: linear-gradient(180deg, #e6a8a8, #c87373); filter: brightness(0.92); }
.picks { position: absolute; top: -12px; right: -4px; display: flex; }
.pchip { width: clamp(20px, 2.6vw, 28px); height: clamp(20px, 2.6vw, 28px); margin-left: -7px; border-radius: 50%; border: 2px solid #0a0a0e; display: flex; align-items: center; justify-content: center; font-family: var(--font-horror-type); font-size: clamp(8px, 1.1vw, 12px); color: #fff; text-shadow: 0 1px 2px #000; }

.cups { display: flex; justify-content: center; align-items: flex-end; gap: clamp(6px, 1.6vw, 24px); }
.cup { position: relative; width: clamp(44px, 7vw, 88px); filter: drop-shadow(0 10px 10px #000a); }
.cup :deep(svg) { width: 100%; height: auto; overflow: visible; }
.cup .tok { position: absolute; left: 50%; top: -16%; transform: translateX(-50%); width: 34%; }
.cup.poisoned { animation: cupshake 0.4s; }
@keyframes cupshake { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-4px); } }

.wheelwrap { position: relative; width: min(42vh, 360px); aspect-ratio: 1/1; }
.wheel { width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 0 0 8px #1c1c22, 0 0 0 12px #000, 0 14px 40px #000c; transition: transform 5s cubic-bezier(0.12, 0.62, 0.12, 1); }
.wheel.spun { transform: rotate(1800deg); }
.wheel-ptr { position: absolute; top: -4%; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 28px solid var(--blood2); z-index: 3; }
.wheel-hub { position: absolute; inset: 42%; border-radius: 50%; background: radial-gradient(#2a2a32, #0a0a0e); border: 3px solid #000; }

.dicerow { display: flex; gap: clamp(8px, 2vw, 18px); justify-content: center; }
.die { width: clamp(40px, 6vw, 70px); aspect-ratio: 1/1; background: linear-gradient(150deg, #f3ecdb, #cdc3a8); border-radius: 14%; box-shadow: 0 6px 14px #0008; display: grid; place-items: center; position: relative; }
.die :deep(.pip) { position: absolute; width: 16%; aspect-ratio: 1/1; background: #1a1206; border-radius: 50%; }
.cash { font-family: var(--font-horror-digi); color: var(--amber2); font-size: clamp(36px, 7vw, 80px); line-height: 0.9; text-shadow: 0 0 22px #000; }

.death { display: flex; flex-direction: column; align-items: center; gap: 1vh; }
.death-doll { width: clamp(110px, 16vw, 200px); }
.death-doll :deep(svg) { width: 100%; height: auto; }

.fin-head { display: flex; flex-direction: column; align-items: center; gap: 0.4vh; }
.fin-opts { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.fin-opts .ans { font-size: clamp(12px, 1.7vw, 20px); }
.lane { position: relative; width: 94%; flex: 1; min-height: clamp(120px, 30vh, 280px); margin-top: 0.6vh; }
.exitdoor { position: absolute; right: 0; top: 0; bottom: 0; width: 8%; background: linear-gradient(180deg, #3a2410, #1c1208); border: 3px solid #0c0804; border-radius: 6px 6px 0 0; box-shadow: 0 0 40px #e8901f55 inset; font-family: var(--font-horror-gore); color: var(--blood2); font-size: clamp(9px, 1.1vw, 14px); text-align: center; padding-top: 6px; }
.dark { position: absolute; left: 0; top: 0; bottom: 0; z-index: 2; background: linear-gradient(90deg, #000 60%, rgba(0, 0, 0, 0.85) 80%, transparent); transition: width 1s ease; }
.track { position: absolute; inset: 0 9% 0 0; display: flex; flex-direction: column; justify-content: space-evenly; }
.runner { position: relative; height: 13%; display: flex; align-items: center; }
.runner.out { opacity: 0.16; filter: grayscale(1); }
.rail { position: absolute; left: 0; right: 0; top: 50%; height: 3px; transform: translateY(-50%); background: repeating-linear-gradient(90deg, #3a3a44 0 10px, transparent 10px 22px); }
.tok { position: absolute; width: clamp(32px, 5vw, 60px); transition: left 1s cubic-bezier(0.3, 0.8, 0.3, 1); z-index: 3; }
.tok-doll :deep(svg) { width: 100%; height: auto; overflow: visible; }
.tok-name { display: block; font-family: var(--font-horror-type); font-size: 9px; text-align: center; line-height: 1; margin-top: -2px; text-shadow: 0 1px 2px #000; }

.clock { position: absolute; left: 2%; bottom: 2%; width: clamp(56px, 9vw, 110px); aspect-ratio: 1.15/1; background: linear-gradient(180deg, #2b8f8a, #176b67); border-radius: 14px; padding: 9% 8%; box-shadow: 0 10px 22px #000a; border: 3px solid #0a3a37; }
.clock .face { height: 100%; background: #0c1413; border-radius: 7px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px #000 inset; }
.clock .num { font-family: var(--font-horror-digi); font-size: clamp(26px, 5vw, 60px); color: #d9fffb; text-shadow: 0 0 12px #2fffe8; }
.clock.low .num { color: #ff8a8a; text-shadow: 0 0 14px #f33; }

.villain { position: absolute; right: 1%; bottom: 0; width: clamp(88px, 12vw, 150px); max-height: 46vh; opacity: 0; transform: translateY(36px) scale(0.85); transition: opacity 0.5s, transform 0.5s, right 0.5s, bottom 0.5s, width 0.5s; pointer-events: none; z-index: 4; }
.villain.on { opacity: 1; transform: translateY(0) scale(1); }
.villain.center { right: 50%; transform: translateX(50%) scale(1.05); bottom: 4%; width: clamp(110px, 15vw, 180px); }
.villain :deep(svg) { width: 100%; height: auto; overflow: visible; }
.villain :deep(#qodTalkMouth), .villain :deep(#qodLidL), .villain :deep(#qodLidR), .villain :deep(#qodHead), .villain :deep(#qodKnifeArm) { transform-box: fill-box; }
.villain :deep(#qodTalkMouth) { transform-origin: center; }
.villain :deep(#qodLidL), .villain :deep(#qodLidR) { transform-origin: top; transform: scaleY(0); }
.villain.talking :deep(#qodTalkMouth) { animation: qodtalk 0.16s ease-in-out infinite alternate; }
.villain.talking :deep(#qodHead) { transform-origin: center; animation: qodnod 0.5s ease-in-out infinite alternate; }
.villain.menace :deep(#qodKnifeArm) { transform-origin: 50% 8%; animation: qodswipe 0.55s ease; }
@keyframes qodtalk { from { transform: scaleY(0.12); } to { transform: scaleY(1); } }
@keyframes qodnod { from { transform: translateY(0); } to { transform: translateY(1.2px); } }
@keyframes qodswipe { 0% { transform: rotate(2deg); } 40% { transform: rotate(-34deg); } 100% { transform: rotate(2deg); } }

.qod-caption { grid-area: caption; text-align: center; min-height: 2.6em; display: flex; flex-direction: column; gap: 2px; opacity: 0; transition: opacity 0.3s; padding: 0 6%; }
.qod-caption.show { opacity: 1; }
.qod-caption .who { font-family: var(--font-horror-gore); color: var(--blood2); font-size: clamp(9px, 1vw, 12px); letter-spacing: 2px; }
.qod-caption .txt { font-family: var(--font-horror-type); color: var(--ghost2); font-size: clamp(12px, 1.5vw, 19px); line-height: 1.35; text-shadow: 0 2px 6px #000; }

.qod-controls { position: absolute; right: 10px; top: 10px; display: flex; gap: 6px; z-index: 6; opacity: 0.5; transition: opacity 0.2s; }
.qod-controls:hover { opacity: 1; }
.ctl { font-family: var(--font-horror-type); font-size: 11px; letter-spacing: 1px; color: var(--ink-h); background: #0d0d12cc; border: 1px solid #2a2a34; border-radius: 5px; padding: 5px 9px; cursor: pointer; }
.ctl.off { color: #6a6a72; text-decoration: line-through; }

.flash { position: absolute; inset: 0; z-index: 30; opacity: 0; pointer-events: none; }
.flash.white { background: #fff; animation: qodflash 0.5s ease; }
.flash.blood { background: radial-gradient(circle, #e23b3b, #7a0f0f); animation: qodflash 0.6s ease; }
@keyframes qodflash { 0% { opacity: 0; } 10% { opacity: 0.9; } 100% { opacity: 0; } }
.qod-stage.shake { animation: qodshake 0.5s; }
@keyframes qodshake { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-7px, 4px); } 40% { transform: translate(6px, -4px); } 60% { transform: translate(-5px, -3px); } 80% { transform: translate(5px, 4px); } }

@media (prefers-reduced-motion: reduce) {
  .villain, .tok, .wheel, .dark, .flash { transition: none; animation: none; }
}
</style>
