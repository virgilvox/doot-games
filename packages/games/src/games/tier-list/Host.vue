<script setup lang="ts">
/**
 * Tier List host: the big-screen show. A custom-flow Host that parks the engine on a
 * single `tier` round and drives an item-by-item vote over the relay:
 *   - `/x/show`        (host -> all, retained): the current phase + item + deadline
 *   - `/x/vote/<i>/<pid>` (player -> host): which tier a player put item <i> in
 *
 * The board fills on the left as each item lands; the NOW RANKING panel on the right
 * carries the current item, the lock count, the timer, and the running leaderboard.
 * The reveal is the beat: lock counts tick up while the distribution stays hidden, then
 * the host (or the timer / a full room) closes voting and the item drops into its tier.
 *
 * The crowd only ever shows up as a lock count + agreement, never as per-player DOM, so
 * the board is the same size for 8 players or 100.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { Avatar, ConfettiBurst, DButton, Icon, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, onUnmounted, ref } from 'vue'
import type { TierContent } from '../../blocks/tier/block'
import { DEFAULT_TIERS, textOn } from '../../blocks/tier/logic'
import GameResults from '../../runtime/GameResults.vue'
import { type ItemResult, type PlacedItem, leaderboard, resolveItem } from './logic'
import type { TierShow } from './show'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<TierContent | null>(() => (config.value?.rounds[0]?.content as TierContent) ?? null)
const items = computed(() => content.value?.items ?? [])
const tiers = computed(() => content.value?.tiers ?? DEFAULT_TIERS)
const joinUrl = computed(() => {
  const code = room.code.value
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})

// ── Lobby controls ──────────────────────────────────────────────────────────
const roundConfig = inject<{ min: number; max: number; default: number; label: string; value: number } | null>('dootRoundConfig', null)
const roundChoices = computed(() => {
  if (!roundConfig) return []
  const out: number[] = []
  for (let n = roundConfig.min; n <= roundConfig.max; n++) out.push(n)
  return out
})
const timersOff = inject<Ref<boolean>>('dootTimersOff', ref(false))
const mode = ref<'one' | 'all'>('one')
const PER_ITEM_SECONDS = 25

// ── Show state (host-authoritative) ─────────────────────────────────────────
const itemIndex = ref(0)
const phase = ref<'voting' | 'reveal'>('voting')
const votes = new Map<number, Map<string, number>>() // itemIndex -> (pid -> tier)
const revealed = new Map<number, ItemResult>() // itemIndex -> resolved consensus
const tick = ref(0) // bumped on every vote / reveal so computeds re-run
const deadline = ref<number | null>(null)
const paused = ref(false)
const pauseRemaining = ref(0)
const nowMs = ref(Date.now())
const confetti = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const tierCount = computed(() => tiers.value.length)
const itemCount = computed(() => items.value.length)
const currentItem = computed(() => items.value[itemIndex.value] ?? null)
const inGame = computed(() => room.phase.value === 'active')

function votesFor(i: number): Map<string, number> {
  let m = votes.get(i)
  if (!m) {
    m = new Map()
    votes.set(i, m)
  }
  return m
}

// The cumulative board: revealed items grouped into their consensus lanes.
const lanes = computed<Array<Array<{ index: number; item: { id: string; label: string; image?: string } }>>>(() => {
  void tick.value
  const out = tiers.value.map(() => [] as Array<{ index: number; item: { id: string; label: string; image?: string } }>)
  for (const [i, res] of revealed) {
    const item = items.value[i]
    if (item && res.tier >= 0) out[res.tier]?.push({ index: i, item })
  }
  for (const lane of out) lane.sort((a, b) => a.index - b.index)
  return out
})

// Live lock count for the current item.
const lockCount = computed(() => {
  void tick.value
  const locked = votesFor(itemIndex.value).size
  const total = room.players.value.length
  return { locked, total }
})

// "TOP OF THE ROOM": match-the-room leaderboard from the placed items so far.
const board = computed(() => {
  void tick.value
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  const placed: PlacedItem[] = []
  for (const [i, res] of revealed) placed.push({ index: i, tier: res.tier, votes: votesFor(i) })
  return leaderboard(roster, placed)
})

// Current item's reveal distribution (shown only at reveal — the hidden-until-close beat).
const currentResult = computed<ItemResult | null>(() => {
  void tick.value
  return revealed.get(itemIndex.value) ?? null
})

const isTimed = computed(() => !timersOff.value)
const remaining = computed(() => {
  if (paused.value) return Math.ceil(pauseRemaining.value / 1000)
  if (!deadline.value) return null
  return Math.max(0, Math.ceil((deadline.value - nowMs.value) / 1000))
})

function colorOf(i: number): string {
  return tiers.value[i]?.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || 'var(--primary)'
}
function inkOf(i: number): string {
  return textOn(colorOf(i))
}

// ── Publish + drive ─────────────────────────────────────────────────────────
function publishShow() {
  const s: TierShow = {
    phase: phase.value,
    mode: mode.value,
    index: itemIndex.value,
    count: itemCount.value,
    deadline: deadline.value,
    paused: paused.value,
  }
  room.publishExtra('show', s as unknown as RelayValue)
}

function startGame() {
  if (roundConfig) roundConfig.value = Math.min(roundConfig.value, itemCount.value || roundConfig.value)
  room.host.start()
  paused.value = false
  if (mode.value === 'all') {
    itemIndex.value = 0
    phase.value = 'voting'
    deadline.value = null // all-at-once is host-closed (boards take a while)
    publishShow()
  } else {
    openItem(0)
  }
}

function openItem(i: number) {
  itemIndex.value = i
  phase.value = 'voting'
  paused.value = false
  deadline.value = isTimed.value ? Date.now() + PER_ITEM_SECONDS * 1000 : null
  confetti.value = false
  publishShow()
}

function reveal() {
  if (mode.value === 'all') {
    for (let i = 0; i < itemCount.value; i++) revealed.set(i, resolveItem(votesFor(i), tierCount.value))
  } else {
    revealed.set(itemIndex.value, resolveItem(votesFor(itemIndex.value), tierCount.value))
  }
  phase.value = 'reveal'
  deadline.value = null
  tick.value++
  confetti.value = true
  publishShow()
}

function next() {
  if (mode.value === 'all') return finish()
  const n = itemIndex.value + 1
  if (n >= itemCount.value) return finish()
  openItem(n)
}

function pauseToggle() {
  if (!isTimed.value || phase.value !== 'voting') return
  if (paused.value) {
    paused.value = false
    deadline.value = Date.now() + pauseRemaining.value
  } else {
    paused.value = true
    pauseRemaining.value = Math.max(0, (deadline.value ?? Date.now()) - Date.now())
    deadline.value = null
  }
  publishShow()
}

function finish() {
  // Resolve anything not yet revealed (defensive), then score.
  for (let i = 0; i < itemCount.value; i++) if (!revealed.has(i)) revealed.set(i, resolveItem(votesFor(i), tierCount.value))
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  const placed: PlacedItem[] = []
  for (const [i, res] of revealed) placed.push({ index: i, tier: res.tier, votes: votesFor(i) })
  const lb = leaderboard(roster, placed)
  const scored = content.value?.scored
  // A board distribution so the results carousel carries the final tiers.
  const bars = [...revealed.entries()]
    .filter(([, r]) => r.tier >= 0)
    .sort((a, b) => a[1].tier - b[1].tier || b[1].agreement - a[1].agreement)
    .map(([i, r]) => ({
      label: items.value[i]?.label ?? `Item ${i + 1}`,
      count: tierCount.value - r.tier,
      max: tierCount.value,
      display: tiers.value[r.tier]?.label ?? '',
      note: `${Math.round(r.agreement * 100)}% agree`,
      correct: r.tier === 0,
    }))
  const top = lb[0]
  const summary: StandardResults = {
    headline: scored && top && top.score > 0 ? `${top.name} read the room` : 'The board is set',
    ...(scored && top && top.score > 0 ? { leaderboard: lb.map((r) => ({ id: r.id, name: r.name, score: r.score, detail: `${r.hits} matched` })) } : {}),
    ...(bars.length ? { distributions: [{ title: content.value?.prompt || 'The final board', bars }] } : {}),
    stats: [
      { label: 'Items', value: itemCount.value },
      { label: 'Players', value: roster.length },
    ],
  }
  room.host.finish(summary as unknown as RelayValue)
}

function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

// ── Lifecycle: collect votes + run the countdown ─────────────────────────────
onMounted(() => {
  room.onExtra('vote/*/*', (v, key) => {
    const parts = key.split('/')
    const i = Number(parts[1])
    const pid = parts[2]
    if (!Number.isInteger(i) || !pid) return
    // Only accept votes for an open item (the current one, or any in all-at-once).
    if (phase.value !== 'voting') return
    if (mode.value === 'one' && i !== itemIndex.value) return
    const t = (v as { tier?: number } | null)?.tier
    if (typeof t !== 'number') return
    votesFor(i).set(pid, t)
    tick.value++
  })
  timer = setInterval(() => {
    nowMs.value = Date.now()
    if (!inGame.value || phase.value !== 'voting') return
    // Auto-close on the deadline, or once everyone present has locked in.
    const lc = lockCount.value
    if (mode.value === 'one' && lc.total > 0 && lc.locked >= lc.total) reveal()
    else if (deadline.value && Date.now() >= deadline.value) reveal()
  }, 300)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="lobby">
    <section class="panel ticket-card"><RoomTicket :code="room.code.value" :url="joinUrl" /></section>
    <section class="panel roster-card">
      <div class="roster-head">
        <div class="kicker">In the room</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />

      <div v-if="roundConfig" class="round-pick">
        <span class="kicker">{{ roundConfig.label }}</span>
        <div class="round-opts" role="group" :aria-label="roundConfig.label">
          <button v-for="n in roundChoices" :key="n" type="button" class="round-opt" :class="{ on: roundConfig.value === n }" :aria-pressed="roundConfig.value === n" @click="roundConfig.value = n">{{ n }}</button>
        </div>
      </div>

      <div class="round-pick">
        <span class="kicker">How to vote</span>
        <div class="seg" role="group" aria-label="Voting mode">
          <button type="button" class="seg-btn" :class="{ on: mode === 'one' }" :aria-pressed="mode === 'one'" @click="mode = 'one'">One at a time</button>
          <button type="button" class="seg-btn" :class="{ on: mode === 'all' }" :aria-pressed="mode === 'all'" @click="mode = 'all'">All at once</button>
        </div>
      </div>

      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!content || itemCount < 2 || room.players.value.length < 1" @click="startGame">Start the tier list</DButton>
      </div>
      <p class="note">One item at a time, the room votes which tier it lands in, and the board fills up. Closest to the room's call climbs the leaderboard.</p>
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
  <div v-else-if="inGame" class="stage">
    <ConfettiBurst v-if="confetti" class="stage-confetti" />
    <header class="tl-head">
      <h1 class="tl-title">{{ config?.title || 'Tier List' }}</h1>
      <div class="tl-meta">
        <span v-if="mode === 'one'" class="tl-tag">ITEM {{ itemIndex + 1 }} / {{ itemCount }}</span>
        <span class="tl-tag" :class="{ live: phase === 'voting' }">{{ phase === 'voting' ? 'VOTING' : 'REVEAL' }}</span>
      </div>
    </header>

    <div class="tl-grid">
      <!-- BOARD (cumulative) -->
      <div class="tl-board">
        <div v-for="(t, ti) in tiers" :key="ti" class="tl-lane" :style="{ '--tc': colorOf(ti), '--tt': inkOf(ti) }">
          <div class="tl-lane-label"><span class="tl-lane-letter">{{ t.label }}</span><span v-if="t.sublabel" class="tl-lane-sub">{{ t.sublabel }}</span></div>
          <TransitionGroup name="tl-drop" tag="div" class="tl-lane-items">
            <div v-for="cell in lanes[ti]" :key="cell.item.id" class="tl-cell">
              <img v-if="cell.item.image" :src="cell.item.image" alt="" class="tl-cell-img" />
              <span class="tl-cell-label">{{ cell.item.label }}</span>
            </div>
          </TransitionGroup>
        </div>
      </div>

      <!-- NOW RANKING + leaderboard -->
      <aside class="tl-side">
        <div class="tl-now panel">
          <div class="kicker">{{ phase === 'voting' ? 'Where does it go?' : 'It landed' }}</div>
          <template v-if="mode === 'one' && currentItem">
            <img v-if="currentItem.image" :src="currentItem.image" alt="" class="tl-now-img" />
            <h2 class="tl-now-name">{{ currentItem.label }}</h2>
            <div v-if="phase === 'reveal' && currentResult && currentResult.tier >= 0" class="tl-landed" :style="{ '--tc': colorOf(currentResult.tier), '--tt': inkOf(currentResult.tier) }">
              {{ tiers[currentResult.tier]?.label }} <span class="tl-landed-agree">· {{ Math.round(currentResult.agreement * 100) }}% agree</span>
            </div>
            <template v-else>
              <p class="tl-locked mono"><b>{{ lockCount.locked }}</b> / {{ lockCount.total }} locked in</p>
              <div class="tl-dots" aria-hidden="true">
                <span v-for="n in lockCount.total" :key="n" class="tl-dot" :class="{ on: n <= lockCount.locked }" />
              </div>
              <p v-if="remaining != null" class="tl-timer mono" :class="{ paused }">{{ paused ? 'paused' : remaining + 's' }}</p>
            </template>
          </template>
          <template v-else>
            <h2 class="tl-now-name">{{ phase === 'voting' ? 'Tier them all' : 'Board is set' }}</h2>
            <p class="tl-locked mono"><b>{{ lockCount.locked }}</b> / {{ lockCount.total }} in</p>
          </template>
        </div>

        <div class="tl-top panel">
          <div class="kicker">Top of the room</div>
          <ol class="tl-lb">
            <li v-for="(r, i) in board.slice(0, 5)" :key="r.id" class="tl-lb-row">
              <span class="tl-lb-rank mono">{{ i + 1 }}</span>
              <Avatar :name="r.name" :id="r.id" :size="22" />
              <span class="tl-lb-name">{{ r.name }}</span>
              <span class="tl-lb-score mono">{{ r.score }}</span>
            </li>
            <li v-if="!board.length" class="tl-lb-empty">No scores yet.</li>
          </ol>
        </div>

        <div class="tl-controls">
          <DButton v-if="phase === 'voting'" variant="primary" size="lg" @click="reveal">Reveal</DButton>
          <template v-else>
            <DButton variant="primary" size="lg" @click="next">{{ mode === 'all' || itemIndex + 1 >= itemCount ? 'Final results' : 'Next item →' }}</DButton>
          </template>
          <button v-if="phase === 'voting' && isTimed && mode === 'one'" type="button" class="tl-pause" :aria-pressed="paused" @click="pauseToggle">
            <Icon :name="paused ? 'mc' : 'mute'" :size="16" /> {{ paused ? 'Resume' : 'Pause' }}
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.lobby {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}
.ticket-card,
.roster-card {
  padding: 24px;
}
.roster-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.round-pick {
  margin-top: 16px;
}
.round-opts,
.seg {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.round-opt,
.seg-btn {
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  border-radius: 10px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.round-opt.on,
.seg-btn.on {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, var(--surface));
  color: var(--primary);
}
.lobby-actions {
  margin-top: 20px;
}
.note {
  margin-top: 12px;
  color: var(--ink-soft);
  font-size: 14px;
}
.results-next {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 18px;
  flex-wrap: wrap;
}

/* The show */
.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}
.tl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.tl-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 3vw, 34px);
}
.tl-meta {
  display: flex;
  gap: 8px;
}
.tl-tag {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 3px 12px;
}
.tl-tag.live {
  color: var(--c1);
  border-color: color-mix(in srgb, var(--c1) 45%, var(--line-soft));
}
.tl-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.tl-board {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
}
.tl-lane {
  display: grid;
  grid-template-columns: clamp(64px, 7vw, 96px) 1fr;
  gap: 8px;
  background: color-mix(in srgb, var(--tc) 9%, var(--surface));
  border: var(--bd) solid color-mix(in srgb, var(--tc) 26%, var(--line-soft));
  border-radius: 12px;
  min-height: clamp(56px, 9vh, 92px);
}
.tl-lane-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--tc);
  color: var(--tt);
  border-radius: 11px 0 0 11px;
  padding: 4px;
}
.tl-lane-letter {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 3vw, 34px);
}
.tl-lane-sub {
  font-weight: 800;
  font-size: 9px;
  letter-spacing: 0.05em;
}
.tl-lane-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: center;
  padding: 6px;
}
.tl-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 9px;
  padding: 5px 10px 5px 5px;
}
.tl-cell-img {
  width: clamp(34px, 4vw, 48px);
  height: clamp(34px, 4vw, 48px);
  border-radius: 7px;
  object-fit: cover;
}
.tl-cell-label {
  font-weight: 700;
  font-size: clamp(13px, 1.5vw, 17px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: clamp(80px, 12vw, 170px);
}
.tl-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.tl-now {
  padding: 18px;
  text-align: center;
}
.tl-now-img {
  width: clamp(96px, 9vw, 150px);
  height: clamp(96px, 9vw, 150px);
  object-fit: cover;
  border-radius: 16px;
  margin: 8px auto;
  border: var(--bd) solid var(--line-soft);
}
.tl-now-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 2.6vw, 32px);
  overflow-wrap: anywhere;
}
.tl-locked {
  margin-top: 8px;
  font-size: 16px;
  color: var(--ink-soft);
}
.tl-locked b {
  color: var(--ink);
  font-size: 20px;
}
.tl-dots {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: center;
  margin: 8px 0;
}
.tl-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--line);
  transition: background 0.2s;
}
.tl-dot.on {
  background: var(--c1);
}
.tl-timer {
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
}
.tl-timer.paused {
  color: var(--mute);
}
.tl-landed {
  margin-top: 10px;
  display: inline-block;
  background: var(--tc);
  color: var(--tt);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 24px;
  border-radius: 12px;
  padding: 8px 18px;
}
.tl-landed-agree {
  font-size: 13px;
  font-family: var(--font-mono);
  font-weight: 700;
}
.tl-top {
  padding: 16px 18px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.tl-lb {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tl-lb-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.tl-lb-rank {
  width: 18px;
  color: var(--mute);
  font-weight: 700;
}
.tl-lb-name {
  flex: 1;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-lb-score {
  font-weight: 800;
  color: var(--c5);
}
.tl-lb-empty {
  color: var(--mute);
  font-style: italic;
}
.tl-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tl-pause {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink-soft);
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
.tl-drop-enter-active {
  transition: transform 0.35s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.35s ease;
}
.tl-drop-enter-from {
  transform: translateY(-22px) scale(0.7);
  opacity: 0;
}
.tl-drop-move {
  transition: transform 0.3s ease;
}
@media (prefers-reduced-motion: reduce) {
  .tl-drop-enter-active,
  .tl-drop-move,
  .tl-dot {
    transition: none;
  }
  .tl-drop-enter-from {
    transform: none;
  }
}
@media (max-width: 900px) {
  .lobby,
  .tl-grid {
    grid-template-columns: 1fr;
  }
}
</style>
