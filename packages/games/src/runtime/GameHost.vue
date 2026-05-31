<script setup lang="ts">
/**
 * Generic host surface for any block-composed game: the lobby, the active round
 * (a common frame around the current block's HostDisplay), the control bar, and
 * the results. No game writes this, it delegates per round to the block.
 */
import { type RelayValue, isEligible } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, RoundInstance, ScorePlayer } from '@doot-games/sdk'
import { ControlBar, CountdownRing, DButton, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import GameResults from './GameResults.vue'
import { getBlock, scoreGame } from './derive'

const props = defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

// Optional host round-count picker (provided by HostRoom for pooled flagships).
interface RoundConfig {
  min: number
  max: number
  default: number
  label: string
  value: number
}
const roundConfig = inject<RoundConfig | null>('dootRoundConfig', null)
const roundChoices = computed(() => {
  if (!roundConfig) return []
  const out: number[] = []
  for (let n = roundConfig.min; n <= roundConfig.max; n++) out.push(n)
  return out
})

// Optional soft player cap, set from the lobby. A reconnecting name still gets in.
const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 20 : null
}
function setCap(raw: string) {
  const n = Math.floor(Number(raw))
  playerCap.value = Number.isFinite(n) && n > 0 ? n : null
}

const now = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  now.value = Date.now()
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 250)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

const config = computed<GameComposition | null>(
  () => (room.config.value as unknown as GameComposition) ?? null,
)
const rounds = computed(() => config.value?.rounds ?? [])
const index = computed(() => room.round.value.index)
const state = computed(() => room.round.value.state)
const instance = computed(() => rounds.value[index.value] ?? null)
const block = computed(() =>
  instance.value ? getBlock(props.plugin, instance.value.block) : undefined,
)
// A two-phase round's content is derived at runtime (the vote options built from
// the prior round's submissions); overlay it on the authored content when present.
const content = computed<Record<string, unknown> | null>(
  () =>
    ((room.runtimeContentFor(index.value) ?? instance.value?.content) as Record<
      string,
      unknown
    >) ?? null,
)
const subject = computed(() => content.value?.subject as string | undefined)
const prompt = computed(() => (content.value?.prompt as string | undefined) ?? '')
const image = computed(() => content.value?.image as string | undefined)
// Hide an image that fails to load rather than show a broken glyph on the big
// screen. Tracked per URL so a later round's valid image still renders.
const failedImages = reactive(new Set<string>())
const showImage = computed(() => !!image.value && !failedImages.has(image.value))
// Only expose the answer at reveal, even on the host's own screen, so a block's
// HostDisplay can never surface it early to the room watching the big screen. The
// runtime key covers both static blocks (their authored answer) and derived
// rounds (the runtime author map).
const answer = computed(() =>
  state.value === 'reveal' ? room.answerKeyFor(index.value) : undefined,
)

const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const countdown = computed(() => {
  const dl = room.round.value.deadline
  const timer = block.value?.timerOf && content.value ? block.value.timerOf(content.value) : null
  if (!dl || !timer) return null
  return { remaining: Math.max(0, dl - now.value), total: timer * 1000 }
})
// "Voting" only fits the judge rounds (Vote/Split); a make/standalone round
// collects answers, so label the state by what's actually happening.
const isJudge = computed(() => !!block.value?.derive)
const stateLabel = computed(() => {
  const labels = {
    ready: 'Get ready',
    open: isJudge.value ? 'Voting open' : 'Answers open',
    locked: isJudge.value ? 'Voting closed' : 'Answers in',
    reveal: 'Results',
  }
  return labels[state.value] ?? state.value
})
const isLast = computed(() => index.value >= rounds.value.length - 1)

// Live "locked in" count so the host knows when to advance: eligible players this
// round who have submitted. Shown only while the round is open/locked.
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
const answering = computed(() => state.value === 'open' || state.value === 'locked')

function finish() {
  const cfg = config.value
  if (!cfg) return
  const players: ScorePlayer[] = room.players.value.map((p) => ({
    id: p.id,
    name: p.name,
    joinedAtIndex: p.joinedAtIndex,
  }))
  // Score against the *effective* config: a two-phase round is scored on its
  // runtime-derived content (the vote options) and runtime answer key (the author
  // map), not the authored placeholder. `answerKeyFor` merges runtime + static.
  const effectiveCfg = {
    ...cfg,
    rounds: cfg.rounds.map((inst, i) => ({
      ...inst,
      content: room.runtimeContentFor(i) ?? inst.content,
    })),
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

// Reload to host a fresh room of the same game (HostRoom re-resolves the config,
// so a pooled flagship re-samples and a saved game re-loads its stored config).
function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

// A "make" round is one a LATER round derives from (e.g. the quip/fill round
// before a vote/split). Its reveal step shows nothing meaningful, which reads as
// "reveal did nothing"; so on a make round we collapse lock -> reveal -> next into
// one "Start the vote" action and use clearer labels.
const isMakeRound = computed(() => {
  const next = rounds.value[index.value + 1] as RoundInstance | undefined
  if (!next) return false
  const nextBlock = getBlock(props.plugin, next.block)
  if (!nextBlock?.derive) return false
  const from = next.from ?? [index.value]
  return from.includes(index.value)
})
function startVote() {
  room.host.reveal()
  room.host.next()
}

// ── Co-host / MC delegation ────────────────────────────────────────────────
// The host can hand the advance controls to a joined player. Default: the host
// drives. An optional "first to join" auto-picks the first player.
const firstToJoin = ref(false)
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

// Apply a delegated player's drive intent through the SAME handlers the host
// buttons use, so "Final results" still scores and a make round still skips its
// empty reveal. Watch the command nonce so each intent fires exactly once, and
// re-check `can()` so a stale or out-of-order intent is a safe no-op.
watch(
  () => room.command.value?.nonce,
  (nonce) => {
    const cmd = room.command.value
    if (!cmd || nonce == null) return
    const a = cmd.action
    if (a === 'open' && room.host.can('open')) room.host.openVoting()
    else if (a === 'lock' && room.host.can('lock')) room.host.lock()
    else if (a === 'startVote' && room.host.can('reveal') && isMakeRound.value) startVote()
    else if (a === 'reveal' && room.host.can('reveal')) room.host.reveal()
    else if (a === 'next' && room.host.can('next')) room.host.next()
    else if (a === 'finish' && state.value === 'reveal' && isLast.value) finish()
  },
)
</script>

<style scoped>
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
</style>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="lobby">
    <section class="panel ticket-card">
      <RoomTicket :code="room.runtime.room" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="roster-head">
        <div class="kicker">In the room</div>
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
        <DButton variant="primary" size="lg" :disabled="!config" @click="room.host.start()">
          Start game
        </DButton>
      </div>
      <p class="note">
        Players who join after you start can only play rounds from when they joined.
      </p>
    </section>
  </div>

  <!-- RESULTS -->
  <div v-else-if="room.phase.value === 'results' && room.results.value" class="results-wrap">
    <GameResults :results="room.results.value as any" />
    <!-- What next (host controls). Plain links/reload so the engine package stays
         router-free; "Play again" reloads to spin up a fresh room of this game. -->
    <div class="results-next">
      <button type="button" class="btn btn-primary btn-lg" @click="playAgain">Play again</button>
      <a class="btn btn-ghost btn-lg" href="/explore">Pick another game</a>
      <a class="btn btn-ghost btn-lg" href="/">Home</a>
    </div>
  </div>

  <!-- ACTIVE -->
  <div v-else-if="instance && block" class="stage">
    <div class="stage-grid">
      <div class="left">
        <span v-if="subject" class="subject">{{ subject }}</span>
        <h1 class="prompt">{{ prompt }}</h1>
        <div v-if="showImage" class="imgbox"><img :src="image" alt="" @error="failedImages.add(image!)" /></div>
      </div>
      <div class="right">
        <component
          :is="block.HostDisplay"
          :key="index"
          :content="content"
          :inputs="room.inputsFor(index)"
          :state="state"
          :answer="answer"
        />
      </div>
    </div>

    <div v-if="driverName" class="driving-note">
      <span><span aria-hidden="true">🎮</span> {{ driverName }} is driving from their phone</span>
      <button type="button" class="take-back" @click="room.host.setDriver(null)">Take back</button>
    </div>

    <ControlBar
      :round-index="index"
      :round-count="rounds.length"
      :state-label="stateLabel"
      :locked-in="lockCount.locked"
      :total="answering ? lockCount.total : 0"
    >
      <CountdownRing v-if="countdown" :remaining="countdown.remaining" :total="countdown.total" />
      <DButton v-if="room.host.can('open')" variant="primary" size="lg" @click="room.host.openVoting()">
        {{ isMakeRound ? 'Collect answers' : 'Open voting' }}
      </DButton>
      <DButton v-else-if="room.host.can('lock')" @click="room.host.lock()">
        {{ isMakeRound ? 'Lock answers' : 'Lock voting' }}
      </DButton>
      <!-- Make round: skip the empty reveal, go straight to the vote. -->
      <DButton v-else-if="room.host.can('reveal') && isMakeRound" variant="primary" size="lg" @click="startVote()">
        Start the vote →
      </DButton>
      <DButton v-else-if="room.host.can('reveal')" variant="primary" @click="room.host.reveal()">
        Reveal
      </DButton>
      <template v-else-if="state === 'reveal'">
        <DButton v-if="!isLast" variant="primary" size="lg" @click="room.host.next()">
          Next round
        </DButton>
        <DButton v-else variant="primary" size="lg" @click="finish()">Final results</DButton>
      </template>
    </ControlBar>
  </div>

  <div v-else class="stage"><p>This game has no rounds yet.</p></div>
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
.round-pick {
  margin-top: 16px;
}
.round-opts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
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
  transition: transform 0.08s, background 0.12s;
}
.round-opt:hover {
  border-color: var(--line);
}
.round-opt.on {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--line);
}
.cap-pick {
  margin-top: 16px;
}
.cap-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
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
.cohost-pick {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cohost-select {
  width: 100%;
  max-width: 260px;
  padding: 9px 12px;
  border-radius: 10px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
}
.cohost-first {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink-soft);
}
.driving-note {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 9px 14px;
  border-radius: 999px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.take-back {
  background: none;
  border: none;
  color: var(--primary);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
}
.lobby-actions {
  margin-top: 18px;
}
.note {
  margin-top: 12px;
  font-size: 13px;
  color: var(--ink-soft);
}
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
.imgbox {
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface-2);
  display: grid;
  place-items: center;
}
/* The question image is the main visual on a guess/trivia round, so fit it whole
   (no crop) rather than filling a fixed box. Capped so a tall image can't blow
   out the stage. */
.imgbox img {
  max-width: 100%;
  max-height: min(46vh, 460px);
  object-fit: contain;
  display: block;
}
@media (max-width: 900px) {
  .lobby,
  .stage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
