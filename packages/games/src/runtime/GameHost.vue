<script setup lang="ts">
/**
 * Generic host surface for any block-composed game: the lobby, the active round
 * (a common frame around the current block's HostDisplay), the control bar, and
 * the results. No game writes this, it delegates per round to the block.
 */
import { type RelayValue, isEligible } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, RoundInstance, ScorePlayer } from '@doot-games/sdk'
import { AudioClip, ControlBar, CountdownRing, DButton, Icon, RoomTicket, RosterChips, StandingsPeek, type StageSfx, createStageSfx } from '@doot-games/ui'
import type { StandardResults } from '@doot-games/sdk'
import { type Ref, computed, inject, onMounted, onUnmounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import GameResults from './GameResults.vue'
import type { FilterTier } from './contentFilter'
import { type ScoreGameContext, getBlock, scoreGame } from './derive'
import { standingsThrough } from './standings'

// `sessionMode`: this game is one leg of a session (a "night of games"), so the
// results page hides its own "play again / pick another" controls — the session
// shell drives "next game" and shows the running session standings instead.
const props = defineProps<{ plugin: GamePlugin; sessionMode?: boolean }>()

// A game may ship a custom results view (e.g. a chain game's "unspool"); fall back
// to the generic board otherwise. Mirrors how the shell honors components.Host.
const ResultsView = computed(() => props.plugin.components?.Results ?? GameResults)
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
// Optional "turn off timers" toggle (provided by HostRoom). Timers are ON by
// default; checking the box nulls every round's timer so nothing auto-locks and
// the host (or the driver) advances each round by hand.
const timersOff = inject<Ref<boolean>>('dootTimersOff', ref(false))
// Auto-advance: close a round the moment every eligible player has answered, so
// there's no dead air waiting on a timer (or, with timers off, no manual lock).
// On by default; the host can turn it off to control the pacing themselves. It
// only locks the round; the host/driver still chooses when to reveal and move on.
const autoAdvance = ref(true)
// Optional content filter (off / moderate / strict), provided by HostRoom. Masks
// flagged words in the derived gallery before publish. Only meaningful for games
// with free-text answers (quip/fill -> a vote gallery), so the picker is gated.
const contentFilter = inject<Ref<FilterTier>>('dootContentFilter', ref('off'))
const hasFreeTextGallery = computed(() => props.plugin.blocks.some((b) => b.kind === 'quip' || b.kind === 'fill'))
function toggleCap(on: boolean) {
  playerCap.value = on ? 20 : null
}
function setCap(raw: string) {
  const n = Math.floor(Number(raw))
  playerCap.value = Number.isFinite(n) && n > 0 ? n : null
}

// Teams (lobby control). The host turns teams on and picks how many; players then
// self-pick on their phones (or the host taps Auto-balance). Ephemeral: the team
// names ride on meta, each player's team on their own relay address. Blocks never
// change; the results roll per-player scores into a team board.
const DEFAULT_TEAM_NAMES = ['Red', 'Blue', 'Green', 'Gold']
const teams = computed(() => room.meta.value?.teams ?? [])
const teamsOn = computed(() => teams.value.length > 0)
const teamCount = ref(2)
function toggleTeams(on: boolean) {
  if (on) room.host.setTeams(DEFAULT_TEAM_NAMES.slice(0, teamCount.value))
  else room.host.setTeams(null)
}
function setTeamCount(n: number) {
  teamCount.value = n
  if (teamsOn.value) room.host.setTeams(DEFAULT_TEAM_NAMES.slice(0, n))
}
function autoBalance() {
  const names = teams.value
  if (!names.length) return
  // Round-robin across the teams in roster order, so the split is even.
  room.players.value.forEach((p, i) => room.host.assignTeam(p.id, names[i % names.length]!))
}

// P4B (lobby control): "let the crowd's votes count" on scored judge rounds. Shown
// only for games that actually have a vote-tallying block, so it doesn't clutter the
// lobby of games where it would do nothing. Ephemeral, on meta (mirrors teams).
// vote/fibvote (single-choice) and split (per-scenario yes/no) all fold the crowd.
// The toggle shows only for games with one of these scored judge blocks.
const CROWD_VOTE_BLOCKS = ['vote', 'fibvote', 'split']
const hasJudgeVote = computed(() => props.plugin.blocks.some((b) => CROWD_VOTE_BLOCKS.includes(b.kind)))
const crowdOn = computed(() => !!room.meta.value?.crowdCounts)
function toggleCrowd(on: boolean) {
  room.host.setCrowdCounts(on)
}

// Host removes a disruptive player (drops them from the roster, board, and scoring).
// Confirm first, since it pulls them from the game.
function kick(pid: string) {
  const who = room.players.value.find((p) => p.id === pid)?.name ?? 'this player'
  if (typeof window !== 'undefined' && !window.confirm(`Remove ${who} from the game?`)) return
  room.host.kickPlayer(pid)
}

// ── Stage SFX (big screen only) ─────────────────────────────────────────────
// Synthesized stage feedback for every composed game: join pop, lock-in click,
// "everyone's in" chime, countdown ticks, reveal sting, results fanfare. The
// context unlocks on a lobby tap or Start (browsers gate audio on a gesture);
// the host can mute from the lobby. Phones never play these.
const sfx = shallowRef<StageSfx | null>(null)
const sfxOn = ref(true)
function armSfx() {
  if (sfxOn.value) sfx.value?.arm()
}
function toggleSfx(on: boolean) {
  sfxOn.value = on
  sfx.value?.setMuted(!on)
  if (on) sfx.value?.arm()
}
function startGame() {
  armSfx()
  room.host.start()
}

const now = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  sfx.value = createStageSfx()
  now.value = Date.now()
  ticker = setInterval(() => {
    now.value = Date.now()
    maybeAutoLock()
  }, 250)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  sfx.value?.dispose()
})

const config = computed<GameComposition | null>(
  () => (room.config.value as unknown as GameComposition) ?? null,
)
const rounds = computed(() => config.value?.rounds ?? [])
const index = computed(() => room.round.value.index)
const state = computed(() => room.round.value.state)
// P4B: expose the current round's audience votes to the block's host view (the poll
// reads them to show a capped "crowd" bloc). provide/inject so non-poll host views
// aren't handed a prop they don't declare.
provide(
  'dootAudienceVotes',
  computed(() => room.audienceVotesFor(index.value)),
)
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
// Scale the prompt down as it gets longer so a paragraph-length question still
// fits the big-screen stage rather than overflowing the answers and control bar.
const promptStyle = computed<Record<string, string> | undefined>(() => {
  const len = prompt.value.length
  if (len <= 80) return undefined
  if (len <= 160) return { fontSize: 'clamp(24px, 3.2vw, 38px)' }
  if (len <= 280) return { fontSize: 'clamp(22px, 2.5vw, 30px)' }
  return { fontSize: 'clamp(20px, 2vw, 26px)' }
})
const image = computed(() => content.value?.image as string | undefined)
// An audio clip prompt (Name That Tune): the big screen is the shared speaker, so
// the host plays it. Phones get a "listen up" hint instead, to avoid 20 phones
// echoing the same clip.
const audio = computed(() => (content.value?.audio as string | undefined) || '')
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
  const code = room.code.value
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const roundTimer = computed(() =>
  block.value?.timerOf && content.value ? block.value.timerOf(content.value) : null,
)
// Does this round run a countdown (after any "turn off timers" override, which nulls
// content.timer)? An untimed round has no clock to start fairly, so we open it on
// entry rather than making the host press a button just to let people begin.
const hasTimer = computed(() => typeof roundTimer.value === 'number' && roundTimer.value > 0)
const countdown = computed(() => {
  const dl = room.round.value.deadline
  const timer = roundTimer.value
  if (!dl || !timer) return null
  return { remaining: Math.max(0, dl - now.value), total: timer * 1000 }
})
// A display block (an info slide / title card) has no player input: the room just
// reads it and the host advances with a single button.
const isDisplay = computed(() => !!block.value?.display)
// A solo block owns the whole stage and drives its own multi-step flow; the generic
// ControlBar + auto-lock are suppressed (the block advances the round itself).
const isSolo = computed(() => !!block.value?.solo)
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

// Auto-lock the round once every eligible player has answered (host-side; the
// host runtime is the authority even when driving is delegated). Checked on the
// host tick (like the engine's own timer auto-lock) rather than a watcher, so it
// reliably picks up roster/input changes. Fires only while the round is open and
// at least one player is in, so an empty room or a non-submitting late joiner
// can't trip it (the timer or the host still cover those). Never auto-reveals or
// advances: the host keeps the reveal beat.
function maybeAutoLock() {
  if (isSolo.value) return // a solo block drives its own advancement
  if (!autoAdvance.value) return
  if (state.value !== 'open') return
  const { locked, total } = lockCount.value
  if (total < 1 || locked < total) return
  if (room.host.can('lock')) room.host.lock()
}

// Build the inputs scoring needs (the effective config + the score context), shared
// by finish() and the between-round standings. Score against the *effective* config:
// a two-phase round is scored on its runtime-derived content (the vote options) and
// runtime answer key (the author map), not the authored placeholder. Teams roll up
// only when teams are ON (a stale pick lingers on the relay after teams are turned off).
function scoreInputs(): { effectiveCfg: GameComposition; ctx: ScoreGameContext } | null {
  const cfg = config.value
  if (!cfg) return null
  const useTeams = (room.meta.value?.teams?.length ?? 0) > 0
  const players: ScorePlayer[] = room.players.value.map((p) => ({
    id: p.id,
    name: p.name,
    joinedAtIndex: p.joinedAtIndex,
    team: useTeams ? p.team : undefined,
  }))
  const effectiveCfg: GameComposition = {
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
  // P4B: only feed the audience's votes into scoring when the host turned the toggle
  // on; otherwise the blocks score player-only (the default). Gated here at the wiring
  // layer so the block code is uniform.
  const useCrowd = !!room.meta.value?.crowdCounts
  return {
    effectiveCfg,
    ctx: {
      inputsFor: (i) => room.inputsFor(i) as Map<string, unknown>,
      players,
      answerKeys,
      audienceVotesFor: useCrowd ? (i) => room.audienceVotesFor(i) as Map<string, unknown> : undefined,
    },
  }
}

function finish() {
  const s = scoreInputs()
  if (!s) return
  room.host.finish(scoreGame(props.plugin, s.effectiveCfg, s.ctx) as unknown as RelayValue)
}

// Publish the running standings after a round is revealed, so phones + the big
// screen can show a between-round leaderboard. Only for a scored game (a leaderboard
// with entries); an unscored game publishes nothing. Cheap + purely presentational.
// The author can suppress the "standings so far" peek after a given round (e.g. a
// rating round whose winner you reveal later); the final results board still shows
// everything. Default on.
const roundShowStandings = computed(
  () => (rounds.value[index.value] as RoundInstance | undefined)?.showStandings !== false,
)
function pushStandings() {
  if (!roundShowStandings.value) return
  const s = scoreInputs()
  if (!s) return
  const summary = standingsThrough(props.plugin, s.effectiveCfg, index.value, s.ctx)
  if (summary.leaderboard?.length) room.host.publishStandings(summary as unknown as RelayValue)
}
// The vote/answer reveal is a real stop (state stays 'reveal'); a make round's
// transient reveal is coalesced away by the watcher, which is fine since it scores
// nothing. Re-publishing on a no-score round would be harmless anyway.
watch(state, (s) => {
  if (s === 'reveal') {
    pushStandings()
    if (!isDisplay.value) sfx.value?.reveal()
  }
})

// ── Stage SFX triggers ──────────────────────────────────────────────────────
// Join pop in the lobby (a relay roster change, so latency is fine for a pop).
watch(
  () => room.players.value.length,
  (n, o) => {
    if (room.phase.value === 'lobby' && n > (o ?? 0)) sfx.value?.join()
  },
)
// Lock-in click per arriving answer; the "everyone's in" chime when the last
// one lands (only meaningful with 2+ players).
watch(
  () => lockCount.value.locked,
  (n, o) => {
    if (state.value !== 'open' || n <= (o ?? 0)) return
    if (n === lockCount.value.total && lockCount.value.total > 1) sfx.value?.allIn()
    else sfx.value?.lockIn()
  },
)
// Countdown ticks over the last five seconds, and a "time's up" drop at zero.
const cdSeconds = computed(() => (countdown.value ? Math.ceil(countdown.value.remaining / 1000) : null))
watch(cdSeconds, (s, prev) => {
  if (s == null || prev == null || s >= prev) return
  if (s > 0 && s <= 5) sfx.value?.tick()
  else if (s === 0) sfx.value?.timeUp()
})
// Results fanfare, once, when the game lands on the final board.
watch(
  () => room.phase.value,
  (p, prev) => {
    if (p === 'results' && prev === 'active') sfx.value?.fanfare()
  },
)

const standings = computed(() => room.standings.value as StandardResults | undefined)
// Show the running standings on the big screen during the reveal beat of a scored
// round (not on a display/slide round, and only once there's something to show).
const showStandings = computed(
  () =>
    state.value === 'reveal' &&
    !isDisplay.value &&
    roundShowStandings.value &&
    (standings.value?.leaderboard?.length ?? 0) > 0,
)

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

// Auto-open a round on entry when there's no reason to hold on "Get ready":
//  - display blocks (slides/title cards): the room just reads them, advanced by one button;
//  - untimed rounds: with no countdown to start fairly, making the host press "Open
//    voting" is a pointless extra tap, so people can just start answering.
// A timed round still opens deliberately, so its clock starts when the host chooses.
// Transitions update local state synchronously, so display blocks can still chain
// through the unused open/lock/reveal beat to the next round.
watch(
  [index, state, isDisplay, hasTimer],
  () => {
    if (state.value !== 'ready' || !room.host.can('open')) return
    if (isDisplay.value || !hasTimer.value) room.host.openVoting()
  },
  { immediate: true },
)
function advanceDisplay() {
  if (room.host.can('open')) room.host.openVoting()
  if (room.host.can('lock')) room.host.lock()
  if (room.host.can('reveal')) room.host.reveal()
  if (isLast.value) {
    finish()
    return
  }
  if (room.host.can('next')) room.host.next()
}

// ── Co-host / MC delegation ────────────────────────────────────────────────
// The host can hand the advance controls to a joined player. Default on: the
// first player to join drives from their phone (handy when hosting off a TV
// where the big screen has no easy input); the host can switch back to "Just me".
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

// ── Authored settings → seed the lobby ─────────────────────────────────────
// The game's `config.settings` are the author's play defaults. Seed every lobby
// control from them ONCE when the config first arrives, so the host opens to the
// authored setup; the host can still change anything (these controls remain). The
// injected refs (cap/timers/filter) are shared with HostRoom, so setting them here
// drives its reload/republish exactly as a manual toggle would.
let settingsSeeded = false
watch(
  config,
  (c) => {
    if (settingsSeeded || !c) return
    settingsSeeded = true
    const s = c.settings
    if (!s) return
    if (s.autoAdvance !== undefined) autoAdvance.value = s.autoAdvance
    if (s.sfx !== undefined) {
      sfxOn.value = s.sfx
      sfx.value?.setMuted(!s.sfx)
    }
    if (s.firstToJoinDrives !== undefined) firstToJoin.value = s.firstToJoinDrives
    if (s.playerCap != null) playerCap.value = s.playerCap
    if (s.timers === false) timersOff.value = true
    if (s.contentFilter) contentFilter.value = s.contentFilter
    if (s.teams && s.teams > 0) teamCount.value = s.teams
  },
  { immediate: true },
)
// Teams/crowd live on relay meta, so seed them through host actions once connected
// (a publish before connect would be dropped). Runs once.
let metaSeeded = false
watch(
  [() => room.connected.value, config],
  () => {
    if (metaSeeded || !room.connected.value || room.phase.value !== 'lobby') return
    const s = config.value?.settings
    if (!s) return
    metaSeeded = true
    if (s.teams && s.teams > 0 && !teamsOn.value) room.host.setTeams(DEFAULT_TEAM_NAMES.slice(0, s.teams))
    if (s.crowdVotes && !crowdOn.value) room.host.setCrowdCounts(true)
  },
  { immediate: true },
)

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
    // A display round advances as one step regardless of the underlying state.
    if (isDisplay.value && a === 'next') return advanceDisplay()
    if (a === 'start' && room.host.can('start')) room.host.start()
    else if (a === 'open' && room.host.can('open')) room.host.openVoting()
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
  <div v-if="room.phase.value === 'lobby'" class="lobby" @pointerdown="armSfx">
    <section class="panel ticket-card">
      <RoomTicket :code="room.code.value" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="lobby-head">
        <h2 class="lobby-title">{{ plugin.manifest.name }}</h2>
        <p v-if="plugin.manifest.description" class="lobby-desc">{{ plugin.manifest.description }}</p>
      </div>
      <div class="roster-head">
        <div class="kicker">In the room</div>
        <span class="count mono">
          {{ room.players.value.length }} joined<template v-if="room.audienceCount.value > 0"> · {{ room.audienceCount.value }} watching</template>
        </span>
      </div>
      <RosterChips :players="room.players.value" :teams="teams" kickable @kick="kick" />
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
      <details class="lobby-advanced">
        <summary class="lobby-advanced-sum">Adjust for tonight</summary>
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
      <div class="cap-pick">
        <label class="cap-row">
          <input
            type="checkbox"
            :checked="teamsOn"
            @change="toggleTeams(($event.target as HTMLInputElement).checked)"
          />
          <span class="kicker">Play in teams</span>
        </label>
        <template v-if="teamsOn">
          <div class="round-opts" role="group" aria-label="Number of teams">
            <button
              v-for="n in [2, 3, 4]"
              :key="n"
              type="button"
              class="round-opt"
              :class="{ on: teams.length === n }"
              :aria-pressed="teams.length === n"
              @click="setTeamCount(n)"
            >
              {{ n }}
            </button>
          </div>
          <button type="button" class="btn btn-ghost btn-block" @click="autoBalance">
            Auto-balance players
          </button>
          <p class="note">Players pick a team on their phones, or tap Auto-balance to split them evenly.</p>
        </template>
      </div>
      <label v-if="hasJudgeVote" class="cap-row timers-row">
        <input
          type="checkbox"
          class="crowd-toggle"
          :checked="crowdOn"
          @change="toggleCrowd(($event.target as HTMLInputElement).checked)"
        />
        <span class="kicker">Let the crowd's votes count</span>
      </label>
      <p v-if="hasJudgeVote && crowdOn" class="note">
        Spectators can vote too. The crowd counts as a capped bloc that can nudge a round, never decide it, and never joins the leaderboard.
      </p>
      <label class="cap-row timers-row">
        <input
          type="checkbox"
          :checked="timersOff"
          @change="timersOff = ($event.target as HTMLInputElement).checked"
        />
        <span class="kicker">Turn off round timers</span>
      </label>
      <label class="cap-row timers-row">
        <input
          type="checkbox"
          :checked="autoAdvance"
          @change="autoAdvance = ($event.target as HTMLInputElement).checked"
        />
        <span class="kicker">Advance as soon as everyone has answered</span>
      </label>
      <label class="cap-row timers-row">
        <input
          type="checkbox"
          :checked="sfxOn"
          @change="toggleSfx(($event.target as HTMLInputElement).checked)"
        />
        <span class="kicker">Sound effects on this screen</span>
      </label>
      <div v-if="hasFreeTextGallery" class="cohost-pick">
        <span class="kicker">Filter answers on the big screen</span>
        <select
          class="cohost-select"
          aria-label="Content filter"
          :value="contentFilter"
          @change="contentFilter = ($event.target as HTMLSelectElement).value as FilterTier"
        >
          <option value="off">Off (anything goes)</option>
          <option value="moderate">Moderate (mask strong language)</option>
          <option value="strict">Strict (family-friendly)</option>
        </select>
      </div>
      </details>
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
        <DButton variant="primary" size="lg" :disabled="!config" @click="startGame">
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
    <component :is="ResultsView" :results="room.results.value as any" :teams="teams" :order="config?.settings?.resultsOrder ?? []" />
    <!-- What next (host controls). Plain links/reload so the engine package stays
         router-free; "Play again" reloads to spin up a fresh room of this game. -->
    <div v-if="!sessionMode" class="results-next">
      <button type="button" class="btn btn-primary btn-lg" @click="playAgain">Play again</button>
      <a class="btn btn-ghost btn-lg" href="/explore">Pick another game</a>
      <a class="btn btn-ghost btn-lg" href="/">Home</a>
    </div>
  </div>

  <!-- ACTIVE -->
  <div v-else-if="instance && block" class="stage">
    <!-- A solo block owns the whole stage AND its controls (item-by-item tier list). -->
    <div v-if="isSolo" class="stage-full">
      <component :is="block.HostDisplay" :key="index" :content="content" :inputs="room.inputsFor(index)" :state="state" :answer="answer" />
    </div>
    <!-- A display block (slide / title card) owns the whole stage. -->
    <div v-else-if="isDisplay" class="stage-full">
      <component :is="block.HostDisplay" :key="index" :content="content" :state="state" />
    </div>
    <div v-else class="stage-grid">
      <div class="left">
        <span v-if="subject" class="subject">{{ subject }}</span>
        <h1 class="prompt" :style="promptStyle">{{ prompt }}</h1>
        <div v-if="showImage" class="imgbox"><img :src="image" alt="" @error="failedImages.add(image!)" /></div>
        <AudioClip v-if="audio" :key="audio" :src="audio" class="stage-audio" :label="prompt || 'Listen'" />
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

    <StandingsPeek
      v-if="showStandings && standings"
      :results="standings"
      :teams="teams"
      class="host-standings"
    />

    <div v-if="driverName" class="driving-note">
      <span class="dn-label"><Icon name="mc" :size="16" /> {{ driverName }} is driving from their phone</span>
      <button type="button" class="take-back" @click="room.host.setDriver(null)">Take back</button>
    </div>

    <!-- A solo block drives its own item flow during 'open' (its ControlBar is hidden),
         then locks+reveals when done so the standard Next round / Final results button
         appears and end-of-game scoring runs over every round as usual. -->
    <ControlBar
      v-if="!isSolo || state === 'reveal'"
      :round-index="index"
      :round-count="rounds.length"
      :state-label="stateLabel"
      :locked-in="lockCount.locked"
      :total="answering ? lockCount.total : 0"
    >
      <CountdownRing v-if="countdown" :remaining="countdown.remaining" :total="countdown.total" />
      <!-- Display blocks: one button advances past the slide. -->
      <DButton v-if="isDisplay" variant="primary" size="lg" @click="advanceDisplay()">
        {{ isLast ? 'Final results' : 'Next →' }}
      </DButton>
      <DButton v-else-if="room.host.can('open')" variant="primary" size="lg" @click="room.host.openVoting()">
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
.lobby-head {
  margin-bottom: 14px;
}
.lobby-title {
  font-size: clamp(20px, 3vw, 28px);
  font-weight: 900;
  line-height: 1.1;
}
.lobby-desc {
  margin-top: 4px;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.45;
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
  gap: 12px;
  cursor: pointer;
}
.timers-row {
  margin-top: 16px;
}
/* Big, easy-to-hit checkboxes + labels so the lobby works from across the room
   on a TV. */
.cap-row input[type='checkbox'],
.cohost-first input[type='checkbox'] {
  width: 26px;
  height: 26px;
  flex: none;
  accent-color: var(--primary);
  cursor: pointer;
}
.cap-row .kicker,
.cohost-pick > .kicker,
.round-pick > .kicker {
  font-size: 15px;
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
.dn-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.host-standings {
  flex: none;
  align-self: center;
  width: min(720px, 100%);
  margin-top: 12px;
}
.stage-audio {
  margin-top: 14px;
  max-width: 560px;
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
/* The authored defaults live here, collapsed, so the lobby stays focused on the
   join code, roster, who-drives, and Start. The host opens it only to tweak. */
.lobby-advanced {
  margin-top: 18px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 12px;
  padding: 4px 14px;
  background: var(--surface);
}
.lobby-advanced[open] {
  padding-bottom: 14px;
}
.lobby-advanced-sum {
  cursor: pointer;
  padding: 10px 0;
  font-weight: 800;
  font-size: 14px;
  color: var(--ink-soft);
  list-style: none;
}
.lobby-advanced-sum::-webkit-details-marker {
  display: none;
}
.lobby-advanced-sum::before {
  content: '▸ ';
  color: var(--primary);
}
.lobby-advanced[open] .lobby-advanced-sum::before {
  content: '▾ ';
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
  min-height: 0;
}
.stage-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  align-items: stretch;
}
/* A display block (slide / title card) takes the whole stage, not the split grid. */
.stage-full {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 8px 0;
}
/* Each column fills the stage height and centers its content. The prompt font
   scales down by length (see promptStyle) so even a paragraph-length question
   fits without overflow, so we DON'T clip here: an `overflow` on either axis
   would also clip the answer cards' glow/shadow. "safe center" keeps the top of
   tall content reachable rather than centering it out of view. */
.left,
.right {
  display: flex;
  flex-direction: column;
  justify-content: safe center;
  min-height: 0;
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
