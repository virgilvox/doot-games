<script setup lang="ts">
/**
 * Truth or Share host: the directed/spotlight show. A custom-flow Host that parks
 * the engine on the single `spotlight` round and drives every turn over the relay's
 * custom channels (the proven Circuit Cypher transport):
 *
 *  - `/x/turn`   (host -> all, retained): the current turn state + phase.
 *  - `/x/pick`   (picker -> host): the chosen target + prompt.
 *  - `/x/response` (target -> host): the typed answer, or a pass.
 *  - `/x/react`  (room -> host): one playful reaction per player.
 *
 * The MODERATION GATE: the target's answer lands on `/x/response/<i>/<pid>` and the
 * host reviews it privately; it is only copied into the public `/x/turn` (and onto
 * the big screen) once the host approves. (Soft caveat, like the rest of Doot's
 * relay: a determined devtools user could read the raw response address; the gate
 * governs what the room SEES, it is not cryptographic secrecy. Passing is always
 * free, no penalty.) All scoring is the pure logic in `truthshare.ts`.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { ConfettiBurst, DButton, Icon, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, onUnmounted, ref } from 'vue'
import type { SpotlightContent } from '../blocks/spotlight/block'
import GameResults from '../runtime/GameResults.vue'
import {
  REACTION_KINDS,
  type ReactionKind,
  type TurnInput,
  type TurnState,
  countReactions,
  dealPrompts,
  leaderboard,
  pickerFor,
  redactTurnForPublish,
  scoreTurn,
} from './truthshare'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<SpotlightContent | null>(() => (config.value?.rounds[0]?.content as SpotlightContent) ?? null)
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})

// ── Lobby ───────────────────────────────────────────────────────────────────
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
const deck = computed(() => (content.value ? (tier.value === 'spicy' ? content.value.spicy : content.value.mild) : []))
const order = ref<string[]>([]) // frozen picker rotation
const turnIndex = ref(0)
const turn = ref<TurnState | null>(null)
const names = new Map<string, string>() // pid -> name, captured as we go
const results: TurnInput[] = []
// The target's pending answer, held HOST-SIDE until the host approves it.
const pendingResponse = ref<{ text: string; passed: boolean } | null>(null)
// Reactions for the current turn, keyed by pid (one each, overwritten).
const reactionsByPid = new Map<string, ReactionKind>()
const reactionTick = ref(0)
const confetti = ref(false)

const phase = computed(() => turn.value?.phase ?? null)
const inGame = computed(() => room.phase.value === 'active' && !!turn.value)
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
  // The moderation gate, enforced in one pure place: an answer never reaches the
  // public turn state before the host approves it (phase react/result).
  const base = redactTurnForPublish(merged)
  turn.value = base
  room.publishExtra('turn', base as unknown as RelayValue)
}

/** The picker for turn `i`: the rotation slot, or the next PRESENT player in the
 *  rotation if that one has left, so a departed picker is substituted WITHOUT
 *  consuming a turn (the turn counter stays bounded by `turns`). '' if the room is
 *  empty. */
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
    finish() // nobody left to pick
    return
  }
  turnIndex.value = i
  pendingResponse.value = null
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
    choices: dealPrompts(deck.value, room.runtime.room, i),
    target: null,
    prompt: null,
    response: null,
  }
  publishTurn()
}

/** Host approves the held answer: it now reaches the room. */
function approve() {
  if (phase.value !== 'moderate' || !pendingResponse.value) return
  publishTurn({ phase: 'react', response: pendingResponse.value.text, passed: false })
}
/** Host skips the answer (off-color, or a stall): treated as a pass, no points. */
function skipAnswer() {
  if (!turn.value) return
  recordAndResult(true)
}
/** Picker is stuck (left, or stalling): skip the whole turn. */
function skipTurn() {
  if (!turn.value) return
  recordAndResult(true)
}

function endReactions() {
  if (phase.value !== 'react') return
  recordAndResult(false)
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
  if (!passed && !input.passed && tally.total > 0) {
    confetti.value = true
  }
  publishTurn({
    phase: 'result',
    passed: input.passed,
    response: passed ? null : t.response ?? null,
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
  startTurn(0)
}
function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

onMounted(() => {
  // Picker chose a target + prompt.
  room.onExtra('pick/*/*', (v, key) => {
    const pid = key.split('/')[1]
    const t = turn.value
    if (!t || t.phase !== 'pick' || pid !== t.pickerPid) return
    const pick = v as { targetPid?: string; promptIndex?: number } | null
    const targetPid = pick?.targetPid
    const pi = pick?.promptIndex
    if (!targetPid || targetPid === t.pickerPid || pi == null) return
    const prompt = t.choices?.[pi]
    if (!prompt) return
    names.set(targetPid, rosterName(targetPid))
    publishTurn({ phase: 'respond', target: { pid: targetPid, name: rosterName(targetPid) }, prompt, choices: undefined })
  })
  // Target answered (or passed). Held host-side until approved.
  room.onExtra('response/*/*', (v, key) => {
    const pid = key.split('/')[1]
    const t = turn.value
    if (!t || t.phase !== 'respond' || pid !== t.target?.pid) return
    const r = v as { text?: string; passed?: boolean } | null
    if (!r) return
    if (r.passed) {
      pendingResponse.value = { text: '', passed: true }
      recordAndResult(true)
      return
    }
    const text = (r.text ?? '').trim()
    if (!text) return
    pendingResponse.value = { text, passed: false }
    publishTurn({ phase: 'moderate' }) // response withheld from the room until approved
  })
  // A room reaction (one per pid, overwritten).
  room.onExtra('react/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    const kind = (v as { kind?: ReactionKind } | null)?.kind
    if (i !== turnIndex.value || !pid || phase.value !== 'react') return
    if (!kind || !REACTION_KINDS.includes(kind)) return
    if (pid === turn.value?.target?.pid) return // the target doesn't react to themselves
    reactionsByPid.set(pid, kind)
    reactionTick.value++
  })
})
onUnmounted(() => {})
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

      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!content || room.players.value.length < 1" @click="startGame">Start the show</DButton>
      </div>
      <p class="note">Each turn one player puts another on the spot. Answer or pass (passing is always free); the room reacts. You need at least three players.</p>
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

  <!-- THE SHOW -->
  <div v-else-if="inGame && turn" class="show">
    <ConfettiBurst v-if="confetti" class="show-confetti" />
    <div class="hud">
      <span class="tag">TURN {{ turn.i + 1 }} / {{ turn.total }}</span>
      <span class="tag spice">{{ tier === 'spicy' ? 'SPICY' : 'MILD' }}</span>
    </div>

    <!-- pick -->
    <div v-if="phase === 'pick'" class="card">
      <div class="kicker"><Icon name="eye" :size="18" /> On the spot</div>
      <h1 class="big">{{ turn.pickerName }} is choosing</h1>
      <p class="sub">Picking who to put in the spotlight, and with what.</p>
      <DButton variant="ghost" @click="skipTurn">Skip this turn</DButton>
    </div>

    <!-- respond -->
    <div v-else-if="phase === 'respond'" class="card">
      <div class="kicker">{{ turn.pickerName }} asks {{ turn.target?.name }}</div>
      <h1 class="prompt">{{ turn.prompt }}</h1>
      <p class="sub">{{ turn.target?.name }} is answering on their phone...</p>
      <DButton variant="ghost" @click="skipTurn">Skip this turn</DButton>
    </div>

    <!-- moderate (host-only gate) -->
    <div v-else-if="phase === 'moderate'" class="card moderate">
      <div class="kicker"><Icon name="mask" :size="18" /> Your call, host</div>
      <h2 class="prompt-sm">{{ turn.prompt }}</h2>
      <blockquote class="answer-preview">{{ pendingResponse?.text }}</blockquote>
      <p class="sub">Only you can see this. Show it to the room, or skip it.</p>
      <div class="mod-actions">
        <DButton variant="primary" size="lg" @click="approve">Show the room</DButton>
        <DButton variant="ghost" @click="skipAnswer">Skip it</DButton>
      </div>
    </div>

    <!-- react -->
    <div v-else-if="phase === 'react'" class="card">
      <div class="kicker">{{ turn.target?.name }} answered</div>
      <h2 class="prompt-sm">{{ turn.prompt }}</h2>
      <blockquote class="answer">{{ turn.response }}</blockquote>
      <div class="react-live">
        <span v-for="k in REACTION_KINDS" :key="k" class="rc">{{ k }}: {{ liveReactions[k] }}</span>
      </div>
      <DButton variant="primary" size="lg" @click="endReactions">Wrap up the turn</DButton>
    </div>

    <!-- result -->
    <div v-else-if="phase === 'result'" class="card">
      <div class="kicker"><Icon name="crown" :size="18" /> Turn done</div>
      <template v-if="turn.passed">
        <h2 class="big">{{ turn.target?.name ? turn.target.name + ' passed' : 'Skipped' }}</h2>
        <p class="sub">No points, no penalty. Passing is always free.</p>
      </template>
      <template v-else>
        <blockquote class="answer">{{ turn.response }}</blockquote>
        <div class="score-row">
          <span class="score-chip">{{ turn.target?.name }} <b>+{{ turn.targetPts }}</b></span>
          <span class="score-chip">{{ turn.pickerName }} (picked) <b>+{{ turn.pickerPts }}</b></span>
        </div>
        <p class="sub">{{ turn.reactions?.total ?? 0 }} {{ (turn.reactions?.total ?? 0) === 1 ? 'reaction' : 'reactions' }} from the room.</p>
      </template>
      <DButton variant="primary" size="lg" @click="nextTurn">{{ turn.i + 1 >= turn.total ? 'Final results' : 'Next turn' }}</DButton>
    </div>
  </div>

  <div v-else class="show"><p class="loading">Setting up the spotlight…</p></div>
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
  min-width: 44px;
  padding: 9px 16px;
  border-radius: 10px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.round-opt.on, .seg-btn.on { background: var(--primary); color: var(--primary-ink); border-color: var(--line); }
.cap-pick { margin-top: 16px; }
.cap-row { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; }
.cap-row input[type='checkbox'] { width: 26px; height: 26px; flex: none; accent-color: var(--primary); cursor: pointer; }
.cap-row .kicker, .round-pick > .kicker, .tier-pick > .kicker { font-size: 15px; }
.cap-input { display: block; margin-top: 8px; width: 110px; padding: 9px 12px; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); font: inherit; font-weight: 700; }
.lobby-actions { margin-top: 18px; }
.note { margin-top: 12px; font-size: 13px; color: var(--ink-soft); }

.results-wrap { flex: 1; display: flex; flex-direction: column; }
.results-next { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }

.show { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
.show-confetti { position: absolute; inset: 0; pointer-events: none; }
.hud { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; }
.tag {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1px;
  padding: 7px 12px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
  border-radius: 6px;
  color: var(--ink-soft);
}
.tag.spice { color: var(--primary); border-color: var(--primary); }
.card {
  width: min(760px, 100%);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.kicker { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); font-size: 15px; }
.big { font-size: clamp(30px, 6vw, 60px); font-weight: 900; }
.prompt { font-size: clamp(26px, 5vw, 48px); font-weight: 800; line-height: 1.1; }
.prompt-sm { font-size: clamp(20px, 3.4vw, 30px); font-weight: 800; color: var(--ink-soft); }
.sub { color: var(--ink-soft); max-width: 36ch; line-height: 1.45; }
.answer, .answer-preview {
  margin: 0;
  width: 100%;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-left: 5px solid var(--primary);
  border-radius: var(--radius);
  padding: 20px 24px;
  font-size: clamp(20px, 4vw, 32px);
  font-weight: 700;
  line-height: 1.35;
}
.answer-preview { border-left-color: var(--c4); }
.moderate { gap: 14px; }
.mod-actions, .score-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.react-live { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; font-weight: 800; color: var(--ink-soft); text-transform: capitalize; }
.score-chip { background: var(--surface-2); border: var(--bd) solid var(--line); border-radius: 999px; padding: 8px 16px; font-weight: 700; }
.score-chip b { color: var(--c5); }
.loading { color: var(--ink-soft); }
@media (max-width: 900px) { .lobby { grid-template-columns: 1fr; } }
</style>
