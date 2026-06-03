<script setup lang="ts">
/**
 * Truth or Share host: the directed/spotlight show on the big screen. A custom-flow
 * Host that parks the engine on the single `spotlight` round and drives every turn
 * over the relay's custom channels:
 *   - `/x/turn`     (host -> all, retained): the current turn state + phase
 *   - `/x/pick`     (picker -> host): the chosen target, then the chosen prompt
 *   - `/x/mode`     (target -> host): Truth or Share
 *   - `/x/response` (target -> host): a typed truth answer, or a pass
 *   - `/x/photo`    (target -> host): a downscaled photo for a Share (relay only,
 *                    never S3; read by the host's big screen, not echoed to phones)
 *   - `/x/react`    (room -> host): one playful reaction per player
 *
 * The flow each turn is a four-step volley: the picker puts someone on the spot, the
 * TARGET chooses Truth or Share, the picker supplies the prompt for that mode, the
 * target responds, then the room reacts. There is no host "vet it first" gate: the
 * host screen IS the room's screen, so nothing private is possible there. Consent is
 * the target's own choice, they pick truth vs share, confirm their photo on their
 * own phone, and a pass is always free. The answer/photo only reaches the big screen
 * at `react`, after the target chose to share it. Scoring is the pure reaction-cut
 * logic in `truthshare.ts`.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { ConfettiBurst, DButton, Icon, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, ref } from 'vue'
import type { SpotlightContent } from '../../blocks/spotlight/block'
import GameResults from '../../runtime/GameResults.vue'
import {
  REACTION_KINDS,
  type ReactionKind,
  type SpotMode,
  type TurnInput,
  type TurnState,
  countReactions,
  dealPrompts,
  leaderboard,
  pickerFor,
  redactTurnForPublish,
  scoreTurn,
} from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<SpotlightContent | null>(() => (config.value?.rounds[0]?.content as SpotlightContent) ?? null)
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})

// ── Lobby controls ──────────────────────────────────────────────────────────
const tier = ref<'mild' | 'spicy'>('mild')
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

// ── Turn state ──────────────────────────────────────────────────────────────
const turns = computed(() => content.value?.turns ?? 5)
function deckFor(mode: SpotMode): string[] {
  const c = content.value
  if (!c) return []
  if (mode === 'share') return tier.value === 'spicy' ? c.sharesSpicy : c.sharesMild
  return tier.value === 'spicy' ? c.truthsSpicy : c.truthsMild
}
const order = ref<string[]>([]) // frozen picker rotation
const turnIndex = ref(0)
const turn = ref<TurnState | null>(null)
const intro = ref(false) // the rules card, shown once after Start
const names = new Map<string, string>()
const results: TurnInput[] = []
// A shared photo, held host-side and rendered on the big screen only (never echoed
// into the turn state, so it never travels to other phones).
const pendingPhoto = ref<string | null>(null)
const reactionsByPid = new Map<string, ReactionKind>()
const reactionTick = ref(0)
const confetti = ref(false)

const phase = computed(() => turn.value?.phase ?? null)
const inGame = computed(() => room.phase.value === 'active' && !intro.value && !!turn.value)
const rosterName = (pid: string) => room.players.value.find((p) => p.id === pid)?.name ?? names.get(pid) ?? 'Someone'
const liveReactions = computed(() => {
  void reactionTick.value
  return countReactions(reactionsByPid.values())
})

function publishTurn(extra: Partial<TurnState> = {}) {
  const merged: TurnState = {
    i: turnIndex.value,
    total: turns.value,
    phase: 'pick',
    pickerPid: '',
    pickerName: '',
    ...turn.value,
    ...extra,
  }
  const base = redactTurnForPublish(merged)
  turn.value = base
  room.publishExtra('turn', base as unknown as RelayValue)
}

function presentPickerFor(i: number): string {
  const present = new Set(room.players.value.map((p) => p.id))
  for (let k = 0; k < order.value.length; k++) {
    const pid = pickerFor(order.value, i + k) ?? ''
    if (pid && present.has(pid)) return pid
  }
  return ''
}

function startTurn(i: number) {
  if (i >= turns.value) {
    finish()
    return
  }
  const pickerPid = presentPickerFor(i)
  if (!pickerPid) {
    finish()
    return
  }
  turnIndex.value = i
  pendingPhoto.value = null
  reactionsByPid.clear()
  reactionTick.value++
  confetti.value = false
  names.set(pickerPid, rosterName(pickerPid))
  turn.value = {
    i,
    total: turns.value,
    phase: 'pick',
    pickerPid,
    pickerName: rosterName(pickerPid),
    roster: room.players.value.map((p) => ({ pid: p.id, name: p.name })),
    target: null,
    mode: null,
    prompt: null,
    response: null,
  }
  publishTurn()
}

function endReactions() {
  if (phase.value !== 'react') return
  recordAndResult(false)
}
/** Host can move a turn along if a picker or target stalls (or things get weird):
 *  scores it as a pass (no points, no penalty). */
function skipTurn() {
  if (!turn.value) return
  recordAndResult(true)
}

function recordAndResult(passed: boolean) {
  const t = turn.value
  if (!t) return
  const tally = countReactions(reactionsByPid.values())
  const input: TurnInput = {
    pickerPid: t.pickerPid,
    targetPid: t.target?.pid ?? '',
    passed: passed || !t.target,
    reactions: tally.total,
  }
  const { targetPts, pickerPts } = scoreTurn(input)
  results.push(input)
  if (!input.passed && tally.total > 0) confetti.value = true
  publishTurn({
    phase: 'result',
    passed: input.passed,
    response: passed ? null : t.response ?? null,
    hasPhoto: passed ? false : t.hasPhoto ?? false,
    reactions: tally,
    targetPts,
    pickerPts,
  })
}

function nextTurn() {
  confetti.value = false
  startTurn(turnIndex.value + 1)
}

function finish() {
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  const board = leaderboard(results, names, roster)
  const top = board[0]
  const summary: StandardResults = {
    headline: top && top.score > 0 ? `${top.name} owned the room` : 'That is a wrap',
    leaderboard: board.map((r) => ({ id: r.id, name: r.name, score: r.score })),
    stats: [
      { label: 'Turns', value: results.length },
      { label: 'Players', value: roster.length },
    ],
  }
  room.host.finish(summary as unknown as RelayValue)
}

function startGame() {
  order.value = room.players.value.map((p) => p.id)
  for (const p of room.players.value) names.set(p.id, p.name)
  room.host.start()
  intro.value = true // show the rules before the first turn
}
function begin() {
  intro.value = false
  startTurn(0)
}
function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

const modeLabel = computed(() => (turn.value?.mode === 'share' ? 'Share' : turn.value?.mode === 'truth' ? 'Truth' : ''))

onMounted(() => {
  // Picker chose a target (phase pick) OR a prompt (phase prompt). Key: `pick/<i>/<pid>`.
  room.onExtra('pick/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const t = turn.value
    if (!t || i !== t.i || pid !== t.pickerPid) return
    const data = v as { targetPid?: string; promptIndex?: number; customPrompt?: string } | null
    if (!data) return
    if (t.phase === 'pick' && data.targetPid && data.targetPid !== t.pickerPid) {
      names.set(data.targetPid, rosterName(data.targetPid))
      publishTurn({ phase: 'mode', target: { pid: data.targetPid, name: rosterName(data.targetPid) } })
      return
    }
    if (t.phase === 'prompt') {
      const custom = (data.customPrompt ?? '').trim()
      const prompt = custom || (data.promptIndex != null ? t.choices?.[data.promptIndex] : '')
      if (!prompt) return
      publishTurn({ phase: 'respond', prompt, choices: undefined })
    }
  })
  // Target chose Truth or Share. Key: `mode/<i>/<pid>`.
  room.onExtra('mode/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const t = turn.value
    if (!t || t.phase !== 'mode' || i !== t.i || pid !== t.target?.pid) return
    const mode = (v as { mode?: SpotMode } | null)?.mode
    if (mode !== 'truth' && mode !== 'share') return
    publishTurn({ phase: 'prompt', mode, choices: dealPrompts(deckFor(mode), room.runtime.room, t.i) })
  })
  // Target answered a Truth, or passed. Key: `response/<i>/<pid>`.
  room.onExtra('response/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const t = turn.value
    if (!t || t.phase !== 'respond' || i !== t.i || pid !== t.target?.pid) return
    const r = v as { text?: string; passed?: boolean } | null
    if (!r) return
    if (r.passed) {
      recordAndResult(true)
      return
    }
    const text = (r.text ?? '').trim()
    if (!text) return
    publishTurn({ phase: 'react', response: text, hasPhoto: false })
  })
  // Target shared a photo (downscaled bitmap, relay-only). Key: `photo/<i>/<pid>`.
  room.onExtra('photo/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const t = turn.value
    if (!t || t.phase !== 'respond' || i !== t.i || pid !== t.target?.pid) return
    const media = (v as { media?: string } | null)?.media
    if (!media || typeof media !== 'string') return
    pendingPhoto.value = media
    publishTurn({ phase: 'react', response: null, hasPhoto: true })
  })
  // A room reaction (one per pid, overwritten). Key: `react/<i>/<pid>`.
  room.onExtra('react/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const kind = (v as { kind?: ReactionKind } | null)?.kind
    if (i !== turnIndex.value || !pid || phase.value !== 'react') return
    if (!kind || !REACTION_KINDS.includes(kind)) return
    if (pid === turn.value?.target?.pid) return
    reactionsByPid.set(pid, kind)
    reactionTick.value++
  })
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
        <div class="kicker">In the spotlight</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />

      <div v-if="roundConfig" class="round-pick">
        <span class="kicker">{{ roundConfig.label }}</span>
        <div class="round-opts" role="group" :aria-label="roundConfig.label">
          <button v-for="n in roundChoices" :key="n" type="button" class="round-opt" :class="{ on: roundConfig.value === n }" :aria-pressed="roundConfig.value === n" @click="roundConfig.value = n">{{ n }}</button>
        </div>
      </div>

      <div class="tier-pick">
        <span class="kicker">Spice level</span>
        <div class="seg" role="group" aria-label="Spice level">
          <button type="button" class="seg-btn" :class="{ on: tier === 'mild' }" :aria-pressed="tier === 'mild'" @click="tier = 'mild'">Mild</button>
          <button type="button" class="seg-btn" :class="{ on: tier === 'spicy' }" :aria-pressed="tier === 'spicy'" @click="tier = 'spicy'">Spicy</button>
        </div>
      </div>

      <div class="cap-pick">
        <label class="cap-row">
          <input type="checkbox" :checked="playerCap != null" @change="toggleCap(($event.target as HTMLInputElement).checked)" />
          <span class="kicker">Limit how many can join</span>
        </label>
        <input v-if="playerCap != null" type="number" min="1" inputmode="numeric" class="cap-input" :value="playerCap ?? 20" aria-label="Maximum players" @input="setCap(($event.target as HTMLInputElement).value)" />
      </div>

      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!content || room.players.value.length < 1" @click="startGame">Start the show</DButton>
      </div>
      <p class="note">Each turn, one player puts another on the spot. The chosen player picks Truth (answer out loud) or Share (show a photo), then does it, or passes. Passing is always free. You need at least three players.</p>
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

  <!-- INTRO / RULES -->
  <div v-else-if="room.phase.value === 'active' && intro" class="stage">
    <div class="spot" />
    <div class="intro">
      <div class="kicker"><Icon name="eye" :size="18" /> Truth or Share</div>
      <h1 class="title">Who is brave tonight?</h1>
      <ol class="rules">
        <li><b>One player picks</b> who is on the spot.</li>
        <li><b>That player chooses</b>: tell a <b>Truth</b>, or <b>Share</b> a photo.</li>
        <li><b>They do it</b>, or pass. Passing is always free.</li>
        <li><b>The room reacts.</b> Big reactions score, and the picker takes a cut, so pick someone good.</li>
      </ol>
      <DButton variant="primary" size="lg" @click="begin">Bring up the first player</DButton>
    </div>
  </div>

  <!-- THE SHOW -->
  <div v-else-if="inGame && turn" class="stage">
    <ConfettiBurst v-if="confetti" class="stage-confetti" />
    <div class="spot" :class="{ hot: phase === 'react' || phase === 'respond' }" />
    <div class="hud">
      <span class="tag">TURN {{ turn.i + 1 }} / {{ turn.total }}</span>
      <span class="tag spice">{{ tier === 'spicy' ? 'SPICY' : 'MILD' }}</span>
    </div>

    <!-- pick: the picker is choosing a target -->
    <div v-if="phase === 'pick'" class="spot-card">
      <div class="kicker"><Icon name="eye" :size="18" /> On the spot</div>
      <h1 class="big">{{ turn.pickerName }} is choosing</h1>
      <p class="sub">Who gets put on the spot this turn?</p>
    </div>

    <!-- mode: the target chooses truth or share -->
    <div v-else-if="phase === 'mode'" class="spot-card">
      <div class="kicker">{{ turn.pickerName }} put them on the spot</div>
      <h1 class="big spotlit">{{ turn.target?.name }}</h1>
      <p class="sub">Truth or Share? It's their call, on their phone.</p>
    </div>

    <!-- prompt: the picker is choosing the prompt for the chosen mode -->
    <div v-else-if="phase === 'prompt'" class="spot-card">
      <div class="kicker">{{ turn.target?.name }} chose <b>{{ modeLabel }}</b></div>
      <h1 class="big">{{ turn.pickerName }} is picking a {{ modeLabel.toLowerCase() }}</h1>
      <p class="sub">{{ turn.mode === 'share' ? 'A photo to ask for...' : 'A question to ask...' }}</p>
    </div>

    <!-- respond: the target is answering / lining up a photo -->
    <div v-else-if="phase === 'respond'" class="spot-card">
      <div class="kicker">{{ turn.pickerName }} asks {{ turn.target?.name }} ({{ modeLabel }})</div>
      <h1 class="prompt">{{ turn.prompt }}</h1>
      <p class="sub">{{ turn.mode === 'share' ? turn.target?.name + ' is lining up a photo...' : turn.target?.name + ' is answering on their phone...' }}</p>
    </div>

    <!-- react: the answer / photo is shown, the room reacts -->
    <div v-else-if="phase === 'react'" class="spot-card wide">
      <div class="kicker">{{ turn.target?.name }} {{ turn.hasPhoto ? 'shared' : 'answered' }}</div>
      <img v-if="turn.hasPhoto && pendingPhoto" :src="pendingPhoto" alt="" class="shared-photo" />
      <blockquote v-else class="answer">{{ turn.response }}</blockquote>
      <div class="react-live">
        <span v-for="k in REACTION_KINDS" :key="k" class="rc">{{ k }}: {{ liveReactions[k] }}</span>
      </div>
      <DButton variant="primary" size="lg" @click="endReactions">Wrap up the turn</DButton>
    </div>

    <!-- result -->
    <div v-else-if="phase === 'result'" class="spot-card">
      <div class="kicker"><Icon name="crown" :size="18" /> Turn done</div>
      <template v-if="turn.passed">
        <h1 class="big">{{ turn.target?.name ? turn.target.name + ' passed' : 'Skipped' }}</h1>
        <p class="sub">No points, no penalty. Passing is always free.</p>
      </template>
      <template v-else>
        <img v-if="turn.hasPhoto && pendingPhoto" :src="pendingPhoto" alt="" class="shared-photo sm" />
        <blockquote v-else class="answer">{{ turn.response }}</blockquote>
        <div class="score-row">
          <span class="score-chip">{{ turn.target?.name }} <b>+{{ turn.targetPts }}</b></span>
          <span class="score-chip">{{ turn.pickerName }} (picked) <b>+{{ turn.pickerPts }}</b></span>
        </div>
        <p class="sub">{{ turn.reactions?.total ?? 0 }} {{ (turn.reactions?.total ?? 0) === 1 ? 'reaction' : 'reactions' }} from the room.</p>
      </template>
    </div>

    <!-- controls -->
    <div class="ctrls">
      <button v-if="phase !== 'react' && phase !== 'result'" type="button" class="ctrl-skip" @click="skipTurn">Skip turn</button>
      <DButton v-if="phase === 'result'" variant="primary" @click="nextTurn">{{ turn.i + 1 >= turn.total ? 'Final results' : 'Next turn' }}</DButton>
    </div>
  </div>

  <div v-else class="stage"><p class="loading">Setting up the spotlight…</p></div>
</template>

<style scoped>
.lobby { flex: 1; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; align-items: start; }
.ticket-card { padding: 30px; }
.roster-card { padding: 22px; }
.roster-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.count { color: var(--c5); font-weight: 700; }
.round-pick, .tier-pick { margin-top: 16px; }
.round-opts, .seg { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.round-opt, .seg-btn {
  min-width: 44px; padding: 9px 16px; border-radius: 10px;
  border: var(--bd) solid var(--line-soft); background: var(--surface);
  color: var(--ink); font: inherit; font-weight: 800; cursor: pointer;
}
.round-opt.on, .seg-btn.on { background: var(--primary); color: var(--primary-ink); border-color: var(--line); }
.cap-pick { margin-top: 16px; }
.cap-row { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; }
.cap-row input[type='checkbox'] { width: 26px; height: 26px; flex: none; accent-color: var(--primary); cursor: pointer; }
.cap-row .kicker, .round-pick > .kicker, .tier-pick > .kicker { font-size: 15px; }
.cap-input { display: block; margin-top: 8px; width: 110px; padding: 9px 12px; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); font: inherit; font-weight: 700; }
.lobby-actions { margin-top: 18px; }
.note { margin-top: 12px; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }

.results-wrap { flex: 1; display: flex; flex-direction: column; }
.results-next { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }

/* The spotlight stage: a dark, theatrical frame with a soft cone of light. */
.stage {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--c5, var(--primary)) 22%, #0c0a14), #0c0a14);
  color: #f6f0ff;
  min-height: 70vh;
}
.spot {
  position: absolute;
  top: -18%;
  left: 50%;
  width: 70%;
  height: 120%;
  transform: translateX(-50%);
  background: radial-gradient(50% 42% at 50% 30%, rgba(255, 240, 210, 0.22), transparent 70%);
  pointer-events: none;
  transition: opacity 0.5s ease;
  opacity: 0.7;
}
.spot.hot { opacity: 1; }
.stage-confetti { position: absolute; inset: 0; pointer-events: none; }
.hud { position: absolute; top: 16px; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 20px; }
.tag {
  font-weight: 800; font-size: 13px; letter-spacing: 1px; padding: 7px 12px;
  border: 2px solid rgba(255, 255, 255, 0.22); background: rgba(0, 0, 0, 0.3);
  border-radius: 6px; color: #f6f0ff; backdrop-filter: blur(4px);
}
.tag.spice { color: #ffc46b; border-color: rgba(255, 196, 107, 0.5); }
.intro, .spot-card {
  position: relative;
  z-index: 1;
  width: min(820px, 92%);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.spot-card.wide { width: min(900px, 94%); }
.kicker { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ffc46b; font-size: 15px; }
.kicker b { color: #fff; }
.title { font-weight: 900; font-size: clamp(30px, 6vw, 60px); }
.rules {
  text-align: left;
  margin: 4px 0 8px;
  padding-left: 26px;
  display: grid;
  gap: 10px;
  font-size: clamp(15px, 2.4vw, 20px);
  line-height: 1.4;
  color: #e9e2f5;
  max-width: 32ch;
}
.rules b { color: #fff; }
.big { font-weight: 900; font-size: clamp(30px, 6vw, 64px); line-height: 1.02; }
.spotlit { text-shadow: 0 0 40px rgba(255, 240, 210, 0.55); color: #fff; }
.prompt { font-weight: 800; font-size: clamp(26px, 5vw, 48px); line-height: 1.1; max-width: 22ch; }
.sub { color: #cfc6e0; max-width: 40ch; line-height: 1.45; font-size: clamp(15px, 2.4vw, 19px); }
.answer {
  margin: 0;
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-left: 5px solid #ffc46b;
  border-radius: var(--radius);
  padding: 22px 26px;
  font-size: clamp(22px, 4.2vw, 36px);
  font-weight: 800;
  line-height: 1.3;
  color: #fff;
}
.shared-photo {
  max-width: min(760px, 92%);
  max-height: 58vh;
  border-radius: 14px;
  border: 3px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  object-fit: contain;
}
.shared-photo.sm { max-height: 40vh; }
.react-live { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; font-weight: 800; color: #cfc6e0; text-transform: capitalize; }
.score-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.score-chip { background: rgba(255, 255, 255, 0.08); border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 999px; padding: 8px 16px; font-weight: 700; }
.score-chip b { color: #ffc46b; }
.ctrls {
  position: absolute;
  right: 18px;
  bottom: 18px;
  display: flex;
  gap: 10px;
  align-items: center;
  z-index: 2;
}
.ctrl-skip {
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  color: #cfc6e0;
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
}
.ctrl-skip:hover { color: #fff; border-color: rgba(255, 255, 255, 0.5); }
.loading { color: var(--ink-soft); }
@media (max-width: 900px) { .lobby { grid-template-columns: 1fr; } }
</style>
