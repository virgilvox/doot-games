<script setup lang="ts">
/**
 * Call It host, the big-screen caller for live predictions. A custom-flow Host that
 * parks the engine on the single `callit` round and drives every call over the relay's
 * custom channels:
 *   - `/x/call`  (host -> all, retained): the current call (prompt + options + phase),
 *                 with the outcome + tally filled only at `result`.
 *   - `/x/pick`  (phone -> host): a player's pick (key `pick/<i>/<pid>`), accepted only
 *                 while the call is open.
 *   - `/x/board` (host -> all, retained): the running standings across all calls.
 * All scoring is the pure, tested logic in `logic.ts`.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { ConfettiBurst, DButton, Icon, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, ref } from 'vue'
import type { CallitContent } from '../../blocks/callit/block'
import GameResults from '../../runtime/GameResults.vue'
import {
  type CallState,
  type LeaderRow,
  applyScores,
  callBoard,
  isPlayableSpec,
  scoreCall,
  tallyPicks,
} from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<CallitContent | null>(() => (config.value?.rounds[0]?.content as CallitContent) ?? null)
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 30 : null
}
function setCap(raw: string) {
  const n = Math.floor(Number(raw))
  playerCap.value = Number.isFinite(n) && n > 0 ? n : null
}

// ── State ────────────────────────────────────────────────────────────────────
type Fine = 'compose' | 'open' | 'locked' | 'result'
const fine = ref<Fine>('compose')
const callIndex = ref(0)
const promptInput = ref('')
const options = ref<string[]>(['Yes', 'No'])
const call = ref<CallState | null>(null)
const picks = new Map<string, number>()
const pickTick = ref(0)
const totals = new Map<string, number>()
const names = new Map<string, string>()
const board = ref<LeaderRow[]>([])
const lastWinners = ref<string[]>([])
const confetti = ref(false)

const rosterName = (pid: string) => room.players.value.find((p) => p.id === pid)?.name ?? names.get(pid) ?? 'Someone'
const playable = computed(() => isPlayableSpec({ prompt: promptInput.value, options: options.value }))
const liveTally = computed(() => {
  void pickTick.value
  return tallyPicks(picks, options.value.length)
})
const pickCount = computed(() => {
  void pickTick.value
  return picks.size
})

function publishCall(extra: Partial<CallState> = {}) {
  const c: CallState = {
    i: callIndex.value,
    phase: 'open',
    prompt: promptInput.value.trim(),
    options: options.value.map((o) => o.trim()).filter(Boolean),
    outcome: null,
    tally: [],
    ...extra,
  }
  call.value = c
  room.publishExtra('call', c as unknown as RelayValue)
}
function publishBoard() {
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  board.value = callBoard(totals, names, roster)
  room.publishExtra('board', { rows: board.value } as unknown as RelayValue)
}

// ── Compose helpers ──────────────────────────────────────────────────────────
function applyOptionSet(set: string[]) {
  options.value = [...set]
}
function setExample(p: string) {
  promptInput.value = p
}
function addOption() {
  if (options.value.length < 4) options.value = [...options.value, '']
}
function removeOption(i: number) {
  if (options.value.length > 2) options.value = options.value.filter((_, k) => k !== i)
}

// ── Flow ─────────────────────────────────────────────────────────────────────
function openCall() {
  if (!playable.value) return
  picks.clear()
  pickTick.value++
  publishCall({ phase: 'open' })
  fine.value = 'open'
}
function lockPicks() {
  if (fine.value !== 'open') return
  fine.value = 'locked'
  publishCall({ phase: 'locked' })
}
function resolve(outcome: number | null) {
  if (fine.value !== 'open' && fine.value !== 'locked') return
  const delta = scoreCall(picks, outcome)
  applyScores(totals, delta)
  lastWinners.value = [...delta.keys()].map(rosterName)
  const tally = tallyPicks(picks, options.value.length)
  publishCall({ phase: 'result', outcome, tally })
  publishBoard()
  fine.value = 'result'
  if (delta.size > 0) {
    confetti.value = true
    if (typeof window !== 'undefined') setTimeout(() => (confetti.value = false), 2200)
  }
}
function nextCall() {
  callIndex.value++
  promptInput.value = ''
  options.value = ['Yes', 'No']
  call.value = null
  fine.value = 'compose'
}

function startGame() {
  for (const p of room.players.value) names.set(p.id, p.name)
  room.host.start()
  fine.value = 'compose'
  publishBoard()
}
function endGame() {
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  const final = callBoard(totals, names, roster)
  const top = final[0]
  const summary: StandardResults = {
    headline: top && top.score > 0 ? `${top.name} called it best` : 'Good calls all round',
    leaderboard: final,
    stats: [
      { label: 'Calls', value: callIndex.value + (fine.value === 'result' ? 1 : 0) },
      { label: 'Players', value: roster.length },
    ],
  }
  room.host.finish(summary as unknown as RelayValue)
}
function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

onMounted(() => {
  // A phone locks a pick. Key: `pick/<i>/<pid>`. Accepted only while open.
  room.onExtra('pick/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    if (!pid || i !== callIndex.value || fine.value !== 'open') return
    const choice = (v as { choice?: number } | null)?.choice
    if (!Number.isInteger(choice) || (choice as number) < 0 || (choice as number) >= options.value.length) return
    picks.set(pid, choice as number)
    pickTick.value++
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
        <div class="kicker">Players</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />
      <div class="pick">
        <label class="cap-row">
          <input type="checkbox" :checked="playerCap != null" @change="toggleCap(($event.target as HTMLInputElement).checked)" />
          <span class="kicker">Limit how many can join</span>
        </label>
        <input v-if="playerCap != null" type="number" min="1" inputmode="numeric" class="cap-input" :value="playerCap ?? 30" aria-label="Maximum players" @input="setCap(($event.target as HTMLInputElement).value)" />
      </div>
      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!content || room.players.value.length < 1" @click="startGame">Start calling</DButton>
      </div>
      <p class="note">Pose a quick prediction from this screen, let the room pick, then tap what actually happens. Right calls score, and the board rolls across as many calls as you want. You need at least two players.</p>
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

  <!-- ACTIVE -->
  <div v-else-if="room.phase.value === 'active'" class="stage">
    <ConfettiBurst v-if="confetti" class="stage-confetti" />
    <div class="hud">
      <span class="tag">CALL {{ callIndex + 1 }}</span>
      <span v-if="board.length" class="tag">LEADER: {{ board[0]?.name }} ({{ board[0]?.score }})</span>
    </div>

    <!-- compose: host writes the next call -->
    <div v-if="fine === 'compose'" class="compose">
      <div class="kicker"><Icon name="bell" :size="18" /> Pose a call</div>
      <textarea v-model="promptInput" class="prompt-input" rows="2" maxlength="160" placeholder="What's going to happen?" aria-label="Prediction prompt" />
      <div class="examples">
        <button v-for="(ex, i) in content?.examples ?? []" :key="i" type="button" class="chip" @click="setExample(ex)">{{ ex }}</button>
      </div>
      <div class="opt-edit">
        <div v-for="(_o, i) in options" :key="i" class="opt-row">
          <input v-model="options[i]" class="opt-input" maxlength="40" :placeholder="`Option ${i + 1}`" :aria-label="`Option ${i + 1}`" />
          <button v-if="options.length > 2" type="button" class="opt-x" aria-label="Remove option" @click="removeOption(i)">x</button>
        </div>
        <button v-if="options.length < 4" type="button" class="chip add" @click="addOption">+ option</button>
      </div>
      <div class="sets">
        <span class="mini">Quick sets:</span>
        <button v-for="s in content?.optionSets ?? []" :key="s.name" type="button" class="chip" @click="applyOptionSet(s.options)">{{ s.name }}</button>
      </div>
      <div class="ctrls">
        <DButton variant="ghost" @click="endGame">End game</DButton>
        <DButton variant="primary" size="lg" :disabled="!playable" @click="openCall">Open the call</DButton>
      </div>
    </div>

    <!-- open / locked: the room is picking -->
    <div v-else-if="(fine === 'open' || fine === 'locked') && call" class="live">
      <div class="kicker">{{ fine === 'open' ? 'Picks are open' : 'Picks locked, tap what happened' }}</div>
      <h1 class="prompt">{{ call.prompt }}</h1>
      <div class="opt-grid">
        <button v-for="(o, i) in call.options" :key="i" type="button" class="opt-card" :disabled="fine === 'open'" @click="resolve(i)">
          <span class="opt-t">{{ o }}</span>
          <span class="opt-n">{{ liveTally[i] ?? 0 }}</span>
        </button>
      </div>
      <p class="sub">{{ pickCount }} {{ pickCount === 1 ? 'pick' : 'picks' }} in{{ fine === 'locked' ? '. Tap the option that actually happened.' : '' }}</p>
      <div class="ctrls">
        <DButton v-if="fine === 'open'" variant="primary" size="lg" @click="lockPicks">Lock picks</DButton>
        <DButton v-else variant="ghost" @click="resolve(null)">Void (no result)</DButton>
      </div>
    </div>

    <!-- result -->
    <div v-else-if="fine === 'result' && call" class="live">
      <div class="kicker"><Icon name="crown" :size="18" /> The call</div>
      <h1 class="prompt">{{ call.prompt }}</h1>
      <div class="opt-grid">
        <div v-for="(o, i) in call.options" :key="i" class="opt-card" :class="{ won: call.outcome === i }">
          <span class="opt-t">{{ o }}</span>
          <span class="opt-n">{{ call.tally[i] ?? 0 }}</span>
        </div>
      </div>
      <p v-if="call.outcome != null" class="sub"><b>{{ call.options[call.outcome] }}</b> it is. {{ lastWinners.length }} {{ lastWinners.length === 1 ? 'player' : 'players' }} called it.</p>
      <p v-else class="sub">Voided, no points this time.</p>
      <ol v-if="board.length" class="board">
        <li v-for="(r, i) in board.slice(0, 5)" :key="r.id"><b>{{ i + 1 }}.</b> {{ r.name }} <span class="bscore">{{ r.score }}</span></li>
      </ol>
      <div class="ctrls">
        <DButton variant="ghost" @click="endGame">End game</DButton>
        <DButton variant="primary" size="lg" @click="nextCall">Next call</DButton>
      </div>
    </div>
  </div>

  <div v-else class="stage"><p class="loading">Getting ready…</p></div>
</template>

<style scoped>
.lobby { flex: 1; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; align-items: start; }
.ticket-card { padding: 30px; }
.roster-card { padding: 22px; }
.roster-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.count { color: var(--c5); font-weight: 700; }
.pick { margin-top: 16px; }
.pick .kicker { font-size: 15px; }
.cap-row { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; }
.cap-row input[type='checkbox'] { width: 26px; height: 26px; flex: none; accent-color: var(--primary); cursor: pointer; }
.cap-input { display: block; margin-top: 8px; width: 110px; padding: 9px 12px; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); font: inherit; font-weight: 700; }
.lobby-actions { margin-top: 18px; }
.note { margin-top: 12px; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }

.results-wrap { flex: 1; display: flex; flex-direction: column; }
.results-next { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }

.stage { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 26px 20px; border-radius: var(--radius-lg); background: radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--c1) 14%, var(--surface)), var(--surface)); min-height: 70vh; }
.stage-confetti { position: absolute; inset: 0; pointer-events: none; }
.hud { width: 100%; display: flex; justify-content: space-between; gap: 8px; }
.tag { font-weight: 800; font-size: 13px; letter-spacing: 1px; padding: 7px 12px; border: var(--bd) solid var(--line-soft); background: var(--surface); border-radius: 6px; color: var(--ink-soft); }
.kicker { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); font-size: 14px; }
.compose, .live { width: min(820px, 96%); display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
.prompt-input { width: 100%; resize: none; font: inherit; font-size: clamp(18px, 3vw, 24px); font-weight: 700; color: var(--ink); background: var(--surface); border: var(--bd) solid var(--line-soft); border-radius: var(--radius); padding: 14px; }
.prompt-input:focus { outline: none; border-color: var(--primary); }
.examples, .sets { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; }
.mini { font-size: 13px; color: var(--ink-soft); font-weight: 700; }
.chip { font: inherit; font-weight: 700; font-size: 13px; padding: 7px 12px; border-radius: 999px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
.chip.add { border-style: dashed; color: var(--primary); }
.opt-edit { display: flex; flex-direction: column; gap: 8px; width: min(420px, 90%); }
.opt-row { display: flex; gap: 8px; align-items: center; }
.opt-input { flex: 1; font: inherit; font-weight: 700; padding: 11px 14px; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); }
.opt-input:focus { outline: none; border-color: var(--primary); }
.opt-x { width: 38px; height: 38px; flex: none; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink-soft); font: inherit; font-weight: 800; cursor: pointer; }
.prompt { font-weight: 900; font-size: clamp(26px, 5vw, 48px); line-height: 1.1; max-width: 22ch; }
.opt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; width: 100%; max-width: 640px; }
.opt-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 14px; border-radius: var(--radius-lg); border: 3px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; }
.opt-card:disabled { cursor: default; }
.opt-card.won { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, var(--surface)); }
.opt-t { font-weight: 900; font-size: clamp(18px, 3.5vw, 26px); }
.opt-n { font-weight: 700; color: var(--ink-soft); }
.sub { color: var(--ink-soft); font-size: clamp(14px, 2.4vw, 18px); }
.sub b { color: var(--primary); }
.board { list-style: none; margin: 0; padding: 6px 0 0; display: flex; flex-direction: column; gap: 4px; width: min(340px, 90%); font-weight: 700; }
.board li { display: flex; gap: 8px; align-items: baseline; }
.board b { color: var(--primary); }
.bscore { margin-left: auto; color: var(--ink-soft); }
.ctrls { margin-top: 8px; display: flex; gap: 12px; align-items: center; }
.loading { color: var(--ink-soft); }
@media (max-width: 900px) { .lobby { grid-template-columns: 1fr; } }
</style>
