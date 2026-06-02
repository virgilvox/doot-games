<script setup lang="ts">
/**
 * Open Mic's big-screen host: a standup comedy club. It is a custom Host over an
 * ordinary `quip -> vote` composition, so all the engine machinery (anonymized
 * derive, answer withholding, vote-share scoring) is reused; only the presentation
 * is custom. The generic GamePlayer still drives the phones (write a bit, then vote).
 *
 *  - Lobby: ticket + roster + premise count + sound + co-host driver, then start.
 *  - Quip (make) round: the premise on the brick-wall stage; the host opens then
 *    closes the mic while everyone writes a one-liner.
 *  - Vote (judge) round = THE SET: the robot comic performs each anonymized bit one
 *    at a time over TTS (the hardened speech engine: chunked, reliable shared voice,
 *    onStart watchdog), the crowd laughs, then the room votes for the funniest and
 *    the winner is revealed.
 *
 * The performance is decorative: the round still runs (silently) where TTS or audio
 * is unavailable, and the engine remains the sole authority over the round lifecycle.
 */
import { type RelayValue, isEligible } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, ScorePlayer } from '@doot-games/sdk'
import {
  type ArenaAudio,
  ComedyStage,
  ConfettiBurst,
  CountdownRing,
  DButton,
  Icon,
  RoomTicket,
  RosterChips,
  announce,
  canSpeak,
  cancelSpeech,
  createArenaAudio,
  primeSpeech,
  speakLines,
  warmUpSpeech,
} from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import GameResults from '../runtime/GameResults.vue'
import { getBlock, scoreGame } from '../runtime/derive'

const props = defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const ACCENT = '#ffb648'
// A few robot-comic personas, cycled per bit so each turn at the mic feels distinct
// (decorative only; the bits stay anonymous until the reveal).
const COMICS = ['The Closer', 'Chuckle Unit', 'Open Mike', 'Deadpan-9000', 'The Headliner', 'Bit Bot']
// Pacing (ms), unhurried so the club breathes.
const PACE = { lineup: 3200, beforeJoke: 700, afterJoke: 1700, betweenSets: 1200 }

// ── Config / round state ────────────────────────────────────────────────────
const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const rounds = computed(() => config.value?.rounds ?? [])
const index = computed(() => room.round.value.index)
const state = computed(() => room.round.value.state)
const instance = computed(() => rounds.value[index.value] ?? null)
const blockKind = computed(() => instance.value?.block ?? '')
const isVoteRound = computed(() => blockKind.value === 'vote')
const content = computed<Record<string, unknown> | null>(
  () => ((room.runtimeContentFor(index.value) ?? instance.value?.content) as Record<string, unknown>) ?? null,
)
const premise = computed(() => (content.value?.prompt as string | undefined) ?? '')
const isLast = computed(() => index.value >= rounds.value.length - 1)

// The anonymized bits to perform this set (derived vote options).
interface Bit {
  id: string
  text: string
}
const bits = computed<Bit[]>(() => ((content.value?.options as Bit[] | undefined) ?? []).filter((b) => b.text?.trim()))

const now = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const countdown = computed(() => {
  const dl = room.round.value.deadline
  const block = instance.value ? getBlock(props.plugin, instance.value.block) : undefined
  const timer = block?.timerOf && content.value ? block.timerOf(content.value) : null
  if (!dl || !timer) return null
  return { remaining: Math.max(0, dl - now.value), total: timer * 1000 }
})
const lockCount = computed(() => {
  const inputs = room.inputsFor(index.value)
  let locked = 0
  let total = 0
  for (const p of room.players.value) {
    if (!isEligible(p.joinedAtIndex, index.value)) continue
    total++
    if (inputs.has(p.id)) locked++
  }
  return { locked, total }
})

// ── Lobby controls ──────────────────────────────────────────────────────────
const roundConfig = inject<{ min: number; max: number; default: number; label: string; value: number } | null>('dootRoundConfig', null)
const roundChoices = computed(() => {
  if (!roundConfig) return []
  const out: number[] = []
  for (let n = roundConfig.min; n <= roundConfig.max; n++) out.push(n)
  return out
})
const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 20 : null
}
function setCap(raw: string) {
  const n = Math.floor(Number(raw))
  playerCap.value = Number.isFinite(n) && n > 0 ? n : null
}

// ── Audio + reduced motion ──────────────────────────────────────────────────
const audio = shallowRef<ArenaAudio | null>(null)
const muted = ref(false)
const calm = ref(false)
function setMuted(m: boolean) {
  muted.value = m
  audio.value?.setMuted(m)
  if (m) cancelSpeech()
  else {
    primeSpeech()
    void audio.value?.start()
  }
}
function mcSay(text: string, onDone?: () => void, onStart?: () => void) {
  if (!muted.value && canSpeak()) announce(text, { onDone, onStart })
  else onDone?.()
}

// ── Show sequencer (the set) ────────────────────────────────────────────────
type Step = 'lineup' | 'perform' | 'voting'
const step = ref<Step>('lineup')
const performing = ref(false)
const mood = ref<'idle' | 'perform' | 'kill' | 'bomb'>('idle')
const bitIndex = ref(0)
const curComic = computed(() => COMICS[bitIndex.value % COMICS.length] ?? 'The Comic')
const curBit = computed(() => bits.value[bitIndex.value] ?? null)
const card = ref<{ kicker?: string; big: string; sub?: string } | null>(null)
const confetti = ref(false)

const pending = ref<null | (() => void)>(null)
let timers: ReturnType<typeof setTimeout>[] = []
function schedule(fn: () => void, ms: number) {
  timers.push(setTimeout(fn, ms))
  pending.value = fn
}
function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}
function speechCapMs(text: string, minHold: number): number {
  return Math.max(minHold, Math.min(20000, Math.max(2200, text.length * 95 + 1600)))
}
/** Speak an MC line, then advance once it finishes (with an onStart watchdog so a
 *  silently-dropped voice doesn't freeze the show). Mirrors CircuitCypherHost. */
function sayThenAdvance(text: string, next: () => void, minHold: number) {
  let advanced = false
  const start = (typeof performance !== 'undefined' ? performance.now() : 0)
  const go = () => {
    if (advanced) return
    advanced = true
    next()
  }
  pending.value = go
  if (muted.value || !canSpeak()) {
    schedule(go, minHold)
    return
  }
  let started = false
  timers.push(setTimeout(() => { if (!started) go() }, Math.max(minHold, 1600)))
  timers.push(setTimeout(go, speechCapMs(text, minHold)))
  mcSay(
    text,
    () => { timers.push(setTimeout(go, Math.max(0, minHold - ((typeof performance !== 'undefined' ? performance.now() : 0) - start)))) },
    () => { started = true },
  )
}

function enterStep(s: Step) {
  clearTimers()
  cancelSpeech()
  pending.value = null
  step.value = s
  if (s === 'lineup') {
    performing.value = false
    mood.value = 'idle'
    confetti.value = false
    card.value = { kicker: 'OPEN MIC NIGHT', big: 'The comics take the stage', sub: premise.value }
    audio.value?.cheer()
    sayThenAdvance(
      bits.value.length
        ? `Welcome back to the open mic! We've got ${bits.value.length} ${bits.value.length === 1 ? 'comic' : 'comics'} ready to go. First up, on the topic: ${premise.value}`
        : 'Welcome back to the open mic!',
      () => (bits.value.length ? enterStep('perform') : openTheVote()),
      PACE.lineup,
    )
  } else if (s === 'perform') {
    performBit()
  } else if (s === 'voting') {
    performing.value = false
    mood.value = 'idle'
    card.value = null
  }
}

function performBit() {
  const bit = curBit.value
  if (!bit) {
    openTheVote()
    return
  }
  card.value = { kicker: `NOW ON THE MIC`, big: curComic.value }
  schedule(() => {
    card.value = null
    performing.value = true
    mood.value = 'perform'
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      performing.value = false
      cancelSpeech()
      // The punchline lands: laughter, an occasional rimshot, a brief "kill".
      audio.value?.laugh(bitIndex.value % 2 === 0)
      if (bitIndex.value % 3 === 1) audio.value?.rimshot()
      mood.value = 'kill'
      schedule(() => {
        mood.value = 'idle'
        if (bitIndex.value + 1 < bits.value.length) {
          bitIndex.value++
          enterStep('perform')
        } else {
          openTheVote()
        }
      }, PACE.afterJoke)
    }
    pending.value = done
    // Deadpan robot delivery of the bit. A one-liner is short, so a single
    // utterance is safe (well under the chunk-stall threshold).
    if (!muted.value && canSpeak()) {
      speakLines([bit.text], { role: 'robotA', rate: 0.96, pitch: 0.55, onDone: done })
    }
    // Time-based fallback guarantees completion even with no boundary events / muted.
    schedule(done, speechCapMs(bit.text, 2600))
  }, PACE.beforeJoke)
}

/** All bits performed: open the vote so phones can pick the funniest. */
function openTheVote() {
  clearTimers()
  cancelSpeech()
  performing.value = false
  mood.value = 'idle'
  enterStep('voting')
  if (room.host.can('open')) room.host.openVoting()
  mcSay('Alright, you heard them. Vote for the bit that killed.')
}

function skip() {
  const fn = pending.value
  if (!fn) return
  pending.value = null
  clearTimers()
  cancelSpeech()
  fn()
}

// ── Reveal / advance ────────────────────────────────────────────────────────
interface VoteSummary {
  tallies: Array<{ id: string; text: string; votes: number; author: string }>
  winnerId: string | null
}
const revealSummary = computed<VoteSummary | null>(() => (room.roundRevealFor(index.value) as VoteSummary | null) ?? null)
const winner = computed(() => {
  const s = revealSummary.value
  if (!s?.winnerId) return null
  return s.tallies.find((t) => t.id === s.winnerId) ?? null
})

function revealFunniest() {
  if (room.host.can('lock')) room.host.lock()
  if (room.host.can('reveal')) room.host.reveal()
  confetti.value = true
  audio.value?.airhorn()
  audio.value?.cheer()
  const w = winner.value
  mcSay(w ? `Your funniest bit of the round, from ${w.author}!` : 'And that wraps the round!')
}

function nextSet() {
  confetti.value = false
  if (room.host.can('next')) room.host.next()
}

// ── Make round (quip) controls ──────────────────────────────────────────────
function startTheSet() {
  // End the make round and advance to the vote round (engine publishes the derived
  // bits as we land on it); the show sequencer starts from the round watcher.
  if (room.host.can('reveal')) room.host.reveal()
  if (room.host.can('next')) room.host.next()
}

// ── Finish (scoring, same as GameHost.finish) ───────────────────────────────
function finish() {
  const cfg = config.value
  if (!cfg) return
  const players: ScorePlayer[] = room.players.value.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))
  const effectiveCfg = {
    ...cfg,
    rounds: cfg.rounds.map((inst, i) => ({ ...inst, content: room.runtimeContentFor(i) ?? inst.content })),
  }
  const answerKeys: Record<number, unknown> = {}
  cfg.rounds.forEach((_, i) => {
    const a = room.answerKeyFor(i)
    if (a !== undefined) answerKeys[i] = a
  })
  const summary = scoreGame(props.plugin, effectiveCfg, {
    inputsFor: (i) => room.inputsFor(i) as Map<string, unknown>,
    players,
    answerKeys,
  })
  room.host.finish(summary as unknown as RelayValue)
}

// ── Co-host driving (built-in command path) ─────────────────────────────────
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
/** The delegate's single "advance" maps to the current primary on-screen action. */
function primaryDrive() {
  if (room.phase.value !== 'active') return
  if (isVoteRound.value) {
    if (step.value === 'voting' && state.value === 'open') revealFunniest()
    else if (state.value === 'reveal') (isLast.value ? finish() : nextSet())
    else if (pending.value) skip()
  } else {
    // make (quip) round
    if (room.host.can('open')) room.host.openVoting()
    else if (room.host.can('lock')) room.host.lock()
    else if (room.host.can('reveal')) startTheSet()
  }
}
watch(
  () => room.command.value?.nonce,
  (nonce) => {
    if (room.command.value && nonce != null) primaryDrive()
  },
)

// ── Drive the show off the round lifecycle ──────────────────────────────────
// On entering a vote round at 'ready', start the set. On a host reload that lands
// mid-vote (open/locked/reveal), skip the performance and show the vote/reveal.
watch(
  () => `${index.value}:${state.value}:${blockKind.value}`,
  () => {
    if (room.phase.value !== 'active') return
    if (!isVoteRound.value) return
    if (state.value === 'ready') {
      bitIndex.value = 0
      enterStep('lineup')
    } else if (state.value === 'open' || state.value === 'locked') {
      step.value = 'voting'
    } else if (state.value === 'reveal') {
      step.value = 'voting'
    }
  },
)

function startGame() {
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
    calm.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  warmUpSpeech()
  audio.value = createArenaAudio({ beat: false }) // a club, not a beat
  audio.value.setMuted(muted.value)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  clearTimers()
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
        <div class="kicker">At the club</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />

      <div v-if="roundConfig" class="round-pick">
        <span class="kicker">{{ roundConfig.label }}</span>
        <div class="round-opts" role="group" :aria-label="roundConfig.label">
          <button
            v-for="n in roundChoices"
            :key="n"
            type="button"
            class="round-opt"
            :class="{ on: roundConfig.value === n }"
            :aria-pressed="roundConfig.value === n"
            @click="roundConfig.value = n"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <div class="cap-pick">
        <label class="cap-row">
          <input type="checkbox" :checked="playerCap != null" @change="toggleCap(($event.target as HTMLInputElement).checked)" />
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

      <label class="cap-row sound-row">
        <input type="checkbox" :checked="!muted" @change="setMuted(!($event.target as HTMLInputElement).checked)" />
        <span class="kicker">Sound and robot voices</span>
      </label>

      <div class="cohost-pick">
        <span class="kicker">Who drives the game</span>
        <select class="cohost-select" aria-label="Who drives the game" :value="driverPid ?? ''" @change="pickDriver(($event.target as HTMLSelectElement).value)">
          <option value="">Just me (host)</option>
          <option v-for="p in room.players.value" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <label class="cohost-first">
          <input type="checkbox" :checked="firstToJoin" @change="firstToJoin = ($event.target as HTMLInputElement).checked" />
          <span>Let the first to join drive</span>
        </label>
      </div>

      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!config" @click="startGame">Start the show</DButton>
      </div>
      <p class="note">Write a one-liner to each premise, the robot performs them, then the room votes for the funniest. You need at least three comics.</p>
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

  <!-- VOTE ROUND: THE SET (3D club) -->
  <div v-else-if="isVoteRound" class="club">
    <ComedyStage
      :comedian="{ name: curComic, color: ACCENT }"
      :performing="performing"
      :mood="mood"
      :audio="audio"
      :calm="calm"
    />
    <ConfettiBurst v-if="confetti" class="club-confetti" />
    <div class="overlays">
      <div class="hud-top">
        <span class="tag">OPEN MIC</span>
        <span class="tag live"><span class="dot" />LIVE</span>
      </div>

      <!-- stage card (lineup / now on the mic) -->
      <div v-if="card" :key="`card-${card.big}`" class="stage-card">
        <div v-if="card.kicker" class="kicker">{{ card.kicker }}</div>
        <div class="big pop">{{ card.big }}</div>
        <div v-if="card.sub" class="sub">{{ card.sub }}</div>
      </div>

      <!-- the bit being performed -->
      <div v-if="step === 'perform' && performing && curBit" class="bit">
        <div class="bit-name"><Icon name="mic" :size="24" /> {{ curComic }}</div>
        <div class="bit-text">{{ curBit.text }}</div>
      </div>

      <!-- voting -->
      <div v-if="step === 'voting' && state !== 'reveal'" class="vote">
        <h2>VOTE FOR THE FUNNIEST</h2>
        <ul class="bit-list">
          <li v-for="b in bits" :key="b.id">{{ b.text }}</li>
        </ul>
        <p class="hint">Phones are voting. Reveal when the laughs die down.</p>
      </div>

      <!-- reveal -->
      <div v-if="state === 'reveal'" class="reveal">
        <div class="kicker">FUNNIEST BIT</div>
        <div v-if="winner" class="win-text">{{ winner.text }}</div>
        <div v-if="winner" class="win-author">by {{ winner.author }} ({{ winner.votes }} {{ winner.votes === 1 ? 'vote' : 'votes' }})</div>
        <div v-else class="win-text">A tough crowd tonight.</div>
      </div>

      <div v-if="driverName" class="driving-note">
        <span class="dn-label"><Icon name="mc" :size="16" /> {{ driverName }} is driving</span>
        <button type="button" class="take-back" @click="room.host.setDriver(null)">Take back</button>
      </div>

      <!-- controls -->
      <div class="ctrls">
        <button class="ctrl" type="button" :aria-label="muted ? 'Unmute' : 'Mute'" @click="setMuted(!muted)">
          <Icon :name="muted ? 'mute' : 'volume'" :size="20" />
        </button>
        <button v-if="pending && step !== 'voting'" class="ctrl" type="button" aria-label="Skip" @click="skip">
          <Icon name="skip" :size="20" />
        </button>
        <CountdownRing v-if="step === 'voting' && state === 'open' && countdown" :remaining="countdown.remaining" :total="countdown.total" />
        <DButton v-if="step === 'voting' && state === 'open'" variant="primary" @click="revealFunniest">Reveal the funniest</DButton>
        <template v-else-if="state === 'reveal'">
          <DButton v-if="!isLast" variant="primary" @click="nextSet">Next premise</DButton>
          <DButton v-else variant="primary" @click="finish">Final results</DButton>
        </template>
      </div>
    </div>
  </div>

  <!-- QUIP (make) ROUND: writing room -->
  <div v-else-if="instance" class="club">
    <ComedyStage :comedian="{ name: 'Open Mic', color: ACCENT }" :performing="false" mood="idle" :audio="audio" :calm="calm" />
    <div class="overlays">
      <div class="hud-top">
        <span class="tag">OPEN MIC</span>
        <span class="tag">PREMISE {{ Math.floor(index / 2) + 1 }}</span>
      </div>
      <div class="write">
        <div class="kicker">TONIGHT'S PREMISE</div>
        <h1 class="premise">{{ premise }}</h1>
        <div class="lockin mono">{{ lockCount.locked }}<span v-if="state === 'open'"> / {{ lockCount.total }}</span> {{ lockCount.locked === 1 ? 'bit' : 'bits' }} in</div>
      </div>

      <div v-if="driverName" class="driving-note">
        <span class="dn-label"><Icon name="mc" :size="16" /> {{ driverName }} is driving</span>
        <button type="button" class="take-back" @click="room.host.setDriver(null)">Take back</button>
      </div>

      <div class="ctrls">
        <button class="ctrl" type="button" :aria-label="muted ? 'Unmute' : 'Mute'" @click="setMuted(!muted)">
          <Icon :name="muted ? 'mute' : 'volume'" :size="20" />
        </button>
        <CountdownRing v-if="state === 'open' && countdown" :remaining="countdown.remaining" :total="countdown.total" />
        <DButton v-if="room.host.can('open')" variant="primary" size="lg" @click="room.host.openVoting()">Open the mic</DButton>
        <DButton v-else-if="room.host.can('lock')" @click="room.host.lock()">Close the mic</DButton>
        <DButton v-else-if="room.host.can('reveal')" variant="primary" size="lg" @click="startTheSet">Start the set →</DButton>
      </div>
    </div>
  </div>

  <div v-else class="club"><p class="loading">Setting up the club…</p></div>
</template>

<style scoped>
/* lobby (shared shape with GameHost) */
.lobby {
  flex: 1;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 18px;
  align-items: start;
}
.ticket-card { padding: 30px; }
.roster-card { padding: 22px; }
.roster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.count { color: var(--c5); font-weight: 700; }
.round-pick { margin-top: 16px; }
.round-opts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.round-opt {
  min-width: 44px;
  padding: 9px 14px;
  border-radius: 10px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 17px;
  cursor: pointer;
}
.round-opt.on { background: var(--primary); color: var(--primary-ink); border-color: var(--line); }
.cap-pick { margin-top: 16px; }
.cap-row { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; }
.sound-row { margin-top: 16px; }
.cap-row input[type='checkbox'],
.cohost-first input[type='checkbox'] {
  width: 26px;
  height: 26px;
  flex: none;
  accent-color: var(--primary);
  cursor: pointer;
}
.cap-row .kicker, .cohost-pick > .kicker, .round-pick > .kicker { font-size: 15px; }
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
.cohost-pick { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
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
.cohost-first { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; font-size: 17px; font-weight: 600; color: var(--ink); }
.lobby-actions { margin-top: 18px; }
.note { margin-top: 12px; font-size: 13px; color: var(--ink-soft); }

/* results */
.results-wrap { flex: 1; display: flex; flex-direction: column; }
.results-next { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }

/* club (3D stage + overlays) */
.club {
  position: absolute;
  inset: 0;
  background: #140a06;
  overflow: hidden;
}
.club-confetti { position: absolute; inset: 0; pointer-events: none; }
.overlays {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #fdeedd;
  font-family: var(--font-display, sans-serif);
}
.overlays .ctrls { pointer-events: auto; }
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
  border: 2px solid rgba(255, 182, 72, 0.45);
  background: rgba(28, 14, 6, 0.72);
  border-radius: 4px;
  color: #ffb648;
  backdrop-filter: blur(6px);
}
.live { display: flex; gap: 8px; align-items: center; color: #ff7a59; border-color: rgba(255, 122, 89, 0.5); }
.live .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff7a59;
  box-shadow: 0 0 12px #ff7a59;
  animation: blink 1.1s infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.stage-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.stage-card .kicker { font-size: clamp(13px, 3.2vw, 20px); letter-spacing: 3px; opacity: 0.85; margin-bottom: 10px; color: #ffb648; }
.stage-card .big { font-weight: 900; font-size: clamp(36px, 9vw, 96px); line-height: 0.98; text-shadow: 0 0 26px rgba(255, 182, 72, 0.4); }
.stage-card .sub { font-family: var(--font-body, monospace); font-size: clamp(15px, 3.2vw, 24px); margin-top: 16px; opacity: 0.9; max-width: 26ch; }
.pop { animation: pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
@keyframes pop {
  0% { transform: scale(1.5); opacity: 0; filter: blur(8px); }
  60% { opacity: 1; }
  100% { transform: scale(1); filter: blur(0); }
}
.bit {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 26px;
  text-align: center;
  padding: 0 16px;
}
.bit-name { display: inline-flex; align-items: center; gap: 10px; color: #ffb648; font-weight: 800; font-size: clamp(18px, 4vw, 30px); margin-bottom: 12px; }
.bit-text {
  width: min(840px, calc(100% - 32px));
  margin: 0 auto;
  background: rgba(28, 14, 6, 0.78);
  border: 2px solid rgba(255, 182, 72, 0.5);
  border-radius: 12px;
  padding: 20px 24px;
  font-size: clamp(20px, 4.2vw, 36px);
  font-weight: 800;
  line-height: 1.3;
  backdrop-filter: blur(8px);
}
.vote {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;
}
.vote h2 { font-weight: 900; font-size: clamp(24px, 6vw, 48px); letter-spacing: 1px; color: #ffb648; text-shadow: 0 0 22px rgba(255, 182, 72, 0.4); }
.bit-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(760px, 100%);
}
.bit-list li {
  background: rgba(28, 14, 6, 0.74);
  border: 2px solid rgba(255, 182, 72, 0.3);
  border-radius: 10px;
  padding: 12px 18px;
  font-weight: 700;
  font-size: clamp(15px, 2.6vw, 22px);
  text-align: center;
}
.vote .hint { font-family: var(--font-body, monospace); font-size: 13px; opacity: 0.65; }
.reveal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 24px;
}
.reveal .kicker { font-size: clamp(14px, 3.4vw, 22px); letter-spacing: 3px; color: #ffb648; }
.win-text {
  font-weight: 900;
  font-size: clamp(26px, 6vw, 56px);
  max-width: 24ch;
  text-shadow: 0 0 26px rgba(255, 182, 72, 0.4);
}
.win-author { font-weight: 700; font-size: clamp(16px, 3vw, 24px); opacity: 0.9; }
.write {
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
.write .kicker { font-size: clamp(13px, 3.2vw, 20px); letter-spacing: 3px; color: #ffb648; }
.premise { font-weight: 900; font-size: clamp(28px, 5.5vw, 64px); line-height: 1.05; max-width: 22ch; text-shadow: 0 0 24px rgba(255, 182, 72, 0.35); }
.lockin { font-size: clamp(16px, 3vw, 24px); font-weight: 800; color: #ffb648; }
.driving-note {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 2px solid rgba(255, 182, 72, 0.3);
  background: rgba(28, 14, 6, 0.72);
  font-weight: 700;
  font-size: 13px;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}
.dn-label { display: inline-flex; align-items: center; gap: 6px; }
.take-back { background: none; border: none; color: #ffb648; font: inherit; font-weight: 700; font-size: 12px; cursor: pointer; text-decoration: underline; }
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
  border: 2px solid rgba(255, 182, 72, 0.3);
  background: rgba(28, 14, 6, 0.72);
  color: #fdeedd;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}
.loading { color: var(--ink-soft); padding: 40px; }
@media (max-width: 900px) {
  .lobby { grid-template-columns: 1fr; }
}
</style>
