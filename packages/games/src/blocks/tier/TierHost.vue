<script setup lang="ts">
/**
 * Big screen for the SOLO Tier List block. It owns the whole round: the host parks the
 * engine on this one round (held open), and this view drives an item-by-item vote — the
 * board fills on the left, the NOW RANKING panel carries the current item + lock count +
 * timer, and a TOP OF THE ROOM leaderboard rewards reading the room. When the last item
 * lands, it locks+reveals the round so the standard "Next round / Final results" button
 * takes over (end-of-game scoring runs over every round as usual).
 *
 * Votes flow through the STANDARD round input (`inputs` prop = each player's growing
 * placements), so the normal aggregate scores it; `/x/tiershow` only syncs which item is
 * open. The board is per-ITEM, so the host is the same size for 8 players or 100.
 */
import type { RelayValue, RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { Avatar, ConfettiBurst, DButton, Icon } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import type { TierInput, TierContent } from './block'
import { type ItemConsensus, DEFAULT_TIERS, consensusBoard, runningLeaderboard, textOn } from './logic'
import type { TierShow } from './show'

const props = defineProps<{ content: TierContent; inputs?: Map<string, TierInput>; state: RoundState }>()
const room = injectDootRoom()
const timersOff = inject<Ref<boolean>>('dootTimersOff', ref(false))

const items = computed(() => props.content.items ?? [])
const tiers = computed(() => props.content.tiers ?? DEFAULT_TIERS)
const tierCount = computed(() => tiers.value.length)
const itemCount = computed(() => items.value.length)
const perItemSeconds = computed(() => (typeof props.content.timer === 'number' && props.content.timer > 0 ? props.content.timer : 20))
const isTimed = computed(() => !timersOff.value && typeof props.content.timer === 'number' && props.content.timer > 0)
const LANE_CAP = 16 // items shown per lane before a "+N" chip (keeps a packed band tidy)

// ── Local authoritative show state ──────────────────────────────────────────
const itemIndex = ref(0)
const phase = ref<'voting' | 'reveal'>('voting')
const revealedUpTo = ref(-1)
const deadline = ref<number | null>(null)
const paused = ref(false)
const pauseRemaining = ref(0)
const nowMs = ref(Date.now())
const confetti = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let started = false

const currentItem = computed(() => items.value[itemIndex.value] ?? null)
const allPlacements = computed(() => {
  const out: Record<string, number>[] = []
  for (const i of props.inputs?.values() ?? []) if (i?.placements) out.push(i.placements)
  return out
})
// Per-item consensus over the standard inputs (board cells + reveal).
const board = computed<ItemConsensus[]>(() => consensusBoard(items.value, tierCount.value, allPlacements.value))
function validTier(t: unknown): t is number {
  return typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < tierCount.value
}
function votesForItem(i: number): Map<string, number> {
  const id = items.value[i]?.id
  const m = new Map<string, number>()
  if (!id) return m
  for (const [pid, input] of props.inputs ?? []) {
    const t = input?.placements?.[id]
    if (validTier(t)) m.set(pid, t)
  }
  return m
}

// The cumulative board: items revealed so far, grouped into their consensus lanes.
const lanes = computed(() => {
  const out = tiers.value.map(() => [] as Array<{ index: number; consensus: ItemConsensus }>)
  for (let i = 0; i <= revealedUpTo.value; i++) {
    const c = board.value[i]
    if (c && c.tier >= 0) out[c.tier]?.push({ index: i, consensus: c })
  }
  return out
})
const lockCount = computed(() => {
  const id = currentItem.value?.id
  let locked = 0
  if (id) for (const input of props.inputs?.values() ?? []) if (validTier(input?.placements?.[id])) locked++
  return { locked, total: room.players.value.length }
})
const leaderboard = computed(() => {
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  const placed: Array<{ tier: number; votes: Map<string, number> }> = []
  for (let i = 0; i <= revealedUpTo.value; i++) {
    const c = board.value[i]
    if (c) placed.push({ tier: c.tier, votes: votesForItem(i) })
  }
  return runningLeaderboard(roster, placed)
})
const currentResult = computed(() => board.value[itemIndex.value] ?? null)
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

// ── Drive the show ──────────────────────────────────────────────────────────
function publishShow() {
  const s: TierShow = { phase: phase.value, index: itemIndex.value, count: itemCount.value, deadline: deadline.value, paused: paused.value }
  room.publishExtra('tiershow', s as unknown as RelayValue)
}
function openItem(i: number) {
  itemIndex.value = i
  phase.value = 'voting'
  paused.value = false
  confetti.value = false
  deadline.value = isTimed.value ? Date.now() + perItemSeconds.value * 1000 : null
  publishShow()
}
function revealItem() {
  if (phase.value !== 'voting') return
  revealedUpTo.value = Math.max(revealedUpTo.value, itemIndex.value)
  phase.value = 'reveal'
  deadline.value = null
  confetti.value = true
  publishShow()
}
function nextItem() {
  if (phase.value !== 'reveal') return // guard a double-tap from skipping an item
  if (itemIndex.value + 1 < itemCount.value) openItem(itemIndex.value + 1)
  else wrapUp()
}
function wrapUp() {
  // Items done: drive the round to 'reveal' so the standard Next round / Final results
  // control appears and end-of-game scoring runs over every round.
  if (room.host.can('lock')) room.host.lock()
  if (room.host.can('reveal')) room.host.reveal()
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

// A live host can perform some host action during active play; the editor preview's
// mock room can't (every `can` is false). Used to keep the timer inert in preview.
const isLive = computed(
  () =>
    room.host.can('open') ||
    room.host.can('lock') ||
    room.host.can('reveal') ||
    room.host.can('next') ||
    room.host.can('finish'),
)
onMounted(() => {
  if (!started) {
    started = true
    if (props.state === 'ready' && room.host.can('open')) room.host.openVoting()
    openItem(0)
  }
  timer = setInterval(() => {
    nowMs.value = Date.now()
    // Auto-reveal when the per-item clock runs out — but only once at least one vote is
    // in. A timer that fires on an empty item locks a lone tester out before they can tap
    // ("it auto locks"); hold instead, and let the host's Reveal button move it on.
    if (isLive.value && phase.value === 'voting' && deadline.value && Date.now() >= deadline.value && lockCount.value.locked > 0) {
      revealItem()
    }
  }, 300)
})
// A late joiner gets whatever `/x/tiershow` value the relay last retained; re-push the
// live show whenever the roster grows so a freshly-joined phone always lands on the
// CURRENT item and phase (never a stale 'reveal' from before they arrived).
watch(
  () => room.players.value.length,
  (n, prev) => {
    if (isLive.value && n > prev) publishShow()
  },
)
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="tl-host">
    <ConfettiBurst v-if="confetti" class="tl-confetti" />
    <header class="tl-head">
      <h1 class="tl-title">{{ content.prompt || 'Tier List' }}</h1>
      <div class="tl-meta">
        <span class="tl-tag">ITEM {{ itemIndex + 1 }} / {{ itemCount }}</span>
        <span class="tl-tag" :class="{ live: phase === 'voting' }">{{ phase === 'voting' ? 'VOTING' : 'REVEAL' }}</span>
      </div>
    </header>

    <div class="tl-grid">
      <!-- BOARD (cumulative) -->
      <div class="tl-board">
        <div v-for="(t, ti) in tiers" :key="ti" class="tl-lane" :class="{ dense: lanes[ti]!.length > 6 }" :style="{ '--tc': colorOf(ti), '--tt': inkOf(ti) }">
          <div class="tl-lane-label"><span class="tl-lane-letter">{{ t.label }}</span><span v-if="t.sublabel" class="tl-lane-sub">{{ t.sublabel }}</span></div>
          <TransitionGroup name="tl-drop" tag="div" class="tl-lane-items">
            <div
              v-for="cell in lanes[ti]!.slice(0, LANE_CAP)"
              :key="items[cell.index]!.id"
              class="tl-cell"
              :class="{ img: !!items[cell.index]!.image }"
              :title="items[cell.index]!.label"
            >
              <img v-if="items[cell.index]!.image" :src="items[cell.index]!.image" alt="" class="tl-cell-img" />
              <span class="tl-cell-label">{{ items[cell.index]!.label }}</span>
            </div>
            <div v-if="lanes[ti]!.length > LANE_CAP" :key="`more-${ti}`" class="tl-cell more">+{{ lanes[ti]!.length - LANE_CAP }}</div>
          </TransitionGroup>
        </div>
      </div>

      <!-- NOW RANKING + leaderboard + controls -->
      <aside class="tl-side">
        <div class="tl-now panel">
          <div class="kicker">{{ phase === 'voting' ? 'Where does it go?' : 'It landed' }}</div>
          <template v-if="currentItem">
            <img v-if="currentItem.image" :src="currentItem.image" alt="" class="tl-now-img" />
            <h2 class="tl-now-name" :class="{ big: !currentItem.image }">{{ currentItem.label }}</h2>
            <div v-if="phase === 'reveal' && currentResult && currentResult.tier >= 0" class="tl-landed" :style="{ '--tc': colorOf(currentResult.tier), '--tt': inkOf(currentResult.tier) }">
              {{ tiers[currentResult.tier]?.label }} <span class="tl-landed-agree">· {{ Math.round(currentResult.agreement * 100) }}% agree</span>
            </div>
            <template v-else>
              <p class="tl-locked mono"><b>{{ lockCount.locked }}</b> / {{ lockCount.total }} locked in</p>
              <!-- Small rooms get playful dots; big rooms get a bar (no per-player blowout). -->
              <div v-if="lockCount.total <= 16" class="tl-dots" aria-hidden="true">
                <span v-for="n in lockCount.total" :key="n" class="tl-dot" :class="{ on: n <= lockCount.locked }" />
              </div>
              <div v-else class="tl-bar" aria-hidden="true"><span class="tl-bar-fill" :style="{ width: `${lockCount.total ? (lockCount.locked / lockCount.total) * 100 : 0}%` }" /></div>
              <p v-if="remaining != null" class="tl-timer mono" :class="{ paused }">{{ paused ? 'paused' : remaining + 's' }}</p>
            </template>
          </template>
        </div>

        <div class="tl-top panel">
          <div class="kicker">Top of the room</div>
          <ol class="tl-lb">
            <li v-for="(r, i) in leaderboard.slice(0, 5)" :key="r.id" class="tl-lb-row">
              <span class="tl-lb-rank mono">{{ i + 1 }}</span>
              <Avatar :name="r.name" :id="r.id" :size="22" />
              <span class="tl-lb-name">{{ r.name }}</span>
              <span class="tl-lb-score mono">{{ r.score }}</span>
            </li>
            <li v-if="!leaderboard.some((r) => r.score > 0)" class="tl-lb-empty">No scores yet.</li>
          </ol>
        </div>

        <!-- The block's controls drive the items; once the round is revealed (board
             done) the standard Next round / Final results control takes over. -->
        <div v-if="state !== 'reveal'" class="tl-controls">
          <DButton v-if="phase === 'voting'" variant="primary" size="lg" @click="revealItem">Reveal</DButton>
          <DButton v-else variant="primary" size="lg" @click="nextItem">{{ itemIndex + 1 >= itemCount ? 'Wrap up the board →' : 'Next item →' }}</DButton>
          <button v-if="phase === 'voting' && isTimed" type="button" class="tl-pause" :aria-pressed="paused" @click="pauseToggle">
            <Icon :name="paused ? 'mc' : 'mute'" :size="16" /> {{ paused ? 'Resume' : 'Pause' }}
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tl-host {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* The parent .stage-full is a flex row; fill it (else the grid collapses to content
     width and crams to the left). */
  flex: 1;
  width: 100%;
  min-width: 0;
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
  min-height: clamp(54px, 8.5vh, 90px);
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
  padding: 5px 11px;
  max-width: 100%;
}
.tl-cell.img {
  padding: 4px 9px 4px 4px;
}
.tl-cell-img {
  width: clamp(30px, 3.6vw, 46px);
  height: clamp(30px, 3.6vw, 46px);
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
/* A packed band shrinks its cells so more fit before the +N chip kicks in. */
.tl-lane.dense .tl-cell {
  padding: 3px 8px;
}
.tl-lane.dense .tl-cell-img {
  width: 28px;
  height: 28px;
}
.tl-lane.dense .tl-cell-label {
  font-size: 12px;
  max-width: clamp(60px, 8vw, 120px);
}
.tl-cell.more {
  font-weight: 800;
  color: var(--ink-soft);
  background: transparent;
  border-style: dashed;
}
.tl-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.tl-now {
  padding: 16px 18px;
  text-align: center;
  flex: none;
}
.tl-now-img {
  width: clamp(96px, 8.5vw, 140px);
  height: clamp(96px, 8.5vw, 140px);
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
.tl-now-name.big {
  font-size: clamp(28px, 3.4vw, 44px);
  padding: 10px 0;
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
.tl-bar {
  height: 10px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
  margin: 10px 0;
}
.tl-bar-fill {
  display: block;
  height: 100%;
  background: var(--c1);
  transition: width 0.3s ease;
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
  padding: 14px 18px;
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
  flex: none;
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
  transform: translateY(-20px) scale(0.7);
  opacity: 0;
}
.tl-drop-move {
  transition: transform 0.3s ease;
}
@media (prefers-reduced-motion: reduce) {
  .tl-drop-enter-active,
  .tl-drop-move,
  .tl-dot,
  .tl-bar-fill {
    transition: none;
  }
  .tl-drop-enter-from {
    transform: none;
  }
}
@media (max-width: 900px) {
  .tl-grid {
    grid-template-columns: 1fr;
  }
}
</style>
