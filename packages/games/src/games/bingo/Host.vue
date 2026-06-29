<script setup lang="ts">
/**
 * Bingo host, the big-screen caller. A custom-flow Host that parks the engine on the
 * single `bingo` round and drives the whole game over the relay's custom channels:
 *   - `/x/setup`  (host -> all, retained): the chosen pack + size + pool, so every phone
 *                  deals the SAME per-player card it would (cards are seeded by room+pid,
 *                  never sent, so a reconnecting phone re-derives its identical card).
 *   - `/x/calls`  (host -> all, retained): the items called so far, in order.
 *   - `/x/claim`  (phone -> host): a player shouts bingo (key `claim/<pid>`); the host
 *                  re-derives that player's card from the seed and verifies the line
 *                  against what has actually been called, so a tampered phone can't win.
 *   - `/x/result` (host -> all, retained): the verified winners, in finishing order.
 * All win detection + scoring is the pure, tested logic in `logic.ts`.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { ConfettiBurst, DButton, Icon, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, onMounted, ref } from 'vue'
import type { BingoContent } from '../../blocks/bingo/block'
import GameResults from '../../runtime/GameResults.vue'
import { type BingoSize, type Winner, bingoLeaderboard, callOrder, verifyClaim } from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<BingoContent | null>(() => (config.value?.rounds[0]?.content as BingoContent) ?? null)
const joinUrl = computed(() => {
  const code = room.code.value
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const seed = computed(() => room.code.value)

// ── Lobby controls ───────────────────────────────────────────────────────────
const packs = computed(() => content.value?.packs ?? [])
const packKey = ref('')
const size = ref<BingoSize>((content.value?.size as BingoSize) ?? 5)
const chosenPack = computed(() => packs.value.find((p) => p.key === packKey.value) ?? packs.value[0] ?? null)
const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 30 : null
}
function setCap(raw: string) {
  const n = Math.floor(Number(raw))
  playerCap.value = Number.isFinite(n) && n > 0 ? n : null
}

// ── Live state ───────────────────────────────────────────────────────────────
const pool = ref<string[]>([]) // the active pack's items (frozen at start)
const order = ref<string[]>([]) // the seeded call order
const calledCount = ref(0)
const winners = ref<Winner[]>([])
const confetti = ref(false)
const lastWinnerName = ref('')

const called = computed(() => order.value.slice(0, calledCount.value))
const calledSet = computed(() => new Set(called.value))
const lastCall = computed(() => (calledCount.value > 0 ? order.value[calledCount.value - 1] : null))
const allCalled = computed(() => calledCount.value >= order.value.length && order.value.length > 0)
const rosterName = (pid: string) => room.players.value.find((p) => p.id === pid)?.name ?? 'Someone'
const wonPids = computed(() => new Set(winners.value.map((w) => w.pid)))

function publishSetup() {
  room.publishExtra('setup', { packKey: chosenPack.value?.key ?? '', packName: chosenPack.value?.name ?? 'Bingo', size: size.value, pool: pool.value } as unknown as RelayValue)
}
function publishCalls() {
  room.publishExtra('calls', { calls: called.value, last: lastCall.value } as unknown as RelayValue)
}
function publishResult(over: boolean) {
  room.publishExtra('result', { winners: winners.value, over } as unknown as RelayValue)
}

function startGame() {
  const pack = chosenPack.value
  if (!pack) return
  pool.value = [...new Set(pack.items)]
  order.value = callOrder(seed.value, pool.value)
  calledCount.value = 0
  winners.value = []
  room.host.start()
  publishSetup()
  publishCalls()
  publishResult(false)
}

function callNext() {
  if (allCalled.value) return
  calledCount.value++
  publishCalls()
}

function endGame() {
  const roster = room.players.value.map((p) => ({ id: p.id, name: p.name }))
  const board = bingoLeaderboard(winners.value, roster)
  const first = winners.value[0]
  const summary: StandardResults = {
    headline: first ? `${first.name} got the first bingo` : 'No bingo this time',
    leaderboard: board,
    stats: [
      { label: 'Items called', value: calledCount.value },
      { label: 'Bingos', value: winners.value.length },
    ],
  }
  publishResult(true)
  room.host.finish(summary as unknown as RelayValue)
}

function playAgain() {
  if (typeof window !== 'undefined') window.location.reload()
}

onMounted(() => {
  // A phone shouts bingo. Key: `claim/<pid>`. Re-derive their card from the seed and
  // verify the line against what has actually been called (host is the sole authority).
  room.onExtra('claim/*', (_v, key) => {
    const pid = key.split('/')[1]
    if (!pid || wonPids.value.has(pid)) return
    if (!verifyClaim(seed.value, pid, pool.value, size.value, calledSet.value)) return
    winners.value = [...winners.value, { pid, name: rosterName(pid), place: winners.value.length + 1 }]
    lastWinnerName.value = rosterName(pid)
    confetti.value = true
    publishResult(false)
    if (typeof window !== 'undefined') setTimeout(() => (confetti.value = false), 2600)
  })
})
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="lobby">
    <section class="panel ticket-card">
      <RoomTicket :code="room.code.value" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="roster-head">
        <div class="kicker">Players</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />

      <div class="pick">
        <span class="kicker">Pick a pack</span>
        <div class="pack-opts" role="group" aria-label="Call pack">
          <button v-for="p in packs" :key="p.key" type="button" class="pack-opt" :class="{ on: (packKey || packs[0]?.key) === p.key }" :aria-pressed="(packKey || packs[0]?.key) === p.key" @click="packKey = p.key">
            <span class="pack-name">{{ p.name }}</span>
            <span class="pack-blurb">{{ p.blurb }}</span>
          </button>
        </div>
      </div>

      <div class="pick">
        <span class="kicker">Card size</span>
        <div class="seg" role="group" aria-label="Card size">
          <button v-for="s in [3, 4, 5]" :key="s" type="button" class="seg-btn" :class="{ on: size === s }" :aria-pressed="size === s" @click="size = s as BingoSize">{{ s }} x {{ s }}</button>
        </div>
      </div>

      <div class="pick">
        <label class="cap-row">
          <input type="checkbox" :checked="playerCap != null" @change="toggleCap(($event.target as HTMLInputElement).checked)" />
          <span class="kicker">Limit how many can join</span>
        </label>
        <input v-if="playerCap != null" type="number" min="1" inputmode="numeric" class="cap-input" :value="playerCap ?? 30" aria-label="Maximum players" @input="setCap(($event.target as HTMLInputElement).value)" />
      </div>

      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!content || room.players.value.length < 1" @click="startGame">Start bingo</DButton>
      </div>
      <p class="note">Every player gets a different card on their phone. Call items one at a time from this screen; players mark theirs and shout bingo when they complete a line, row, or diagonal. You need at least two players.</p>
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

  <!-- THE CALL -->
  <div v-else-if="room.phase.value === 'active'" class="stage">
    <ConfettiBurst v-if="confetti" class="stage-confetti" />
    <div class="hud">
      <span class="tag">{{ calledCount }} / {{ order.length }} CALLED</span>
      <span class="tag pack">{{ chosenPack?.name ?? 'Bingo' }}</span>
    </div>

    <div v-if="lastWinnerName && winners.length" class="winner-banner" role="status">
      <Icon name="crown" :size="20" /> {{ lastWinnerName }} got bingo!
    </div>

    <div class="call-card">
      <div class="kicker"><Icon name="bell" :size="18" /> Now calling</div>
      <h1 v-if="lastCall" class="big-call">{{ lastCall }}</h1>
      <h1 v-else class="big-call dim">Tap "Call the first item" to begin</h1>
    </div>

    <!-- Only show the history once a second item is called: with one call the chip
         would just duplicate the big "Now calling" headline above it. -->
    <div v-if="called.length > 1" class="called-grid" aria-label="Items called so far">
      <span v-for="(c, i) in called" :key="c + i" class="called-chip" :class="{ latest: i === called.length - 1 }">{{ c }}</span>
    </div>

    <ol v-if="winners.length" class="winners">
      <li v-for="w in winners" :key="w.pid"><b>{{ w.place }}.</b> {{ w.name }}</li>
    </ol>

    <div class="ctrls">
      <DButton variant="ghost" @click="endGame">End game</DButton>
      <DButton variant="primary" size="lg" :disabled="allCalled" @click="callNext">{{ calledCount === 0 ? 'Call the first item' : allCalled ? 'All called' : 'Call the next item' }}</DButton>
    </div>
  </div>

  <div v-else class="stage"><p class="loading">Setting up the cards…</p></div>
</template>

<style scoped>
.lobby { flex: 1; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; align-items: start; }
.ticket-card { padding: 30px; }
.roster-card { padding: 22px; }
.roster-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.count { color: var(--c5); font-weight: 700; }
.pick { margin-top: 16px; }
.pick > .kicker, .cap-row .kicker { font-size: 15px; }
.pack-opts { display: grid; gap: 8px; margin-top: 8px; }
.pack-opt { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 12px 16px; border-radius: 12px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; }
.pack-opt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--surface)); }
.pack-name { font-weight: 800; }
.pack-blurb { font-size: 13px; color: var(--ink-soft); }
.seg { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.seg-btn { min-width: 64px; padding: 9px 16px; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); font: inherit; font-weight: 800; cursor: pointer; }
.seg-btn.on { background: var(--primary); color: var(--primary-ink); border-color: var(--line); }
.cap-row { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; }
.cap-row input[type='checkbox'] { width: 26px; height: 26px; flex: none; accent-color: var(--primary); cursor: pointer; }
.cap-input { display: block; margin-top: 8px; width: 110px; padding: 9px 12px; border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); font: inherit; font-weight: 700; }
.lobby-actions { margin-top: 18px; }
.note { margin-top: 12px; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }

.results-wrap { flex: 1; display: flex; flex-direction: column; }
.results-next { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }

.stage { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 18px; padding: 28px 20px; border-radius: var(--radius-lg); background: radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--primary) 14%, var(--surface)), var(--surface)); min-height: 70vh; overflow: hidden; }
.stage-confetti { position: absolute; inset: 0; pointer-events: none; }
.hud { width: 100%; display: flex; justify-content: space-between; }
.tag { font-weight: 800; font-size: 13px; letter-spacing: 1px; padding: 7px 12px; border: var(--bd) solid var(--line-soft); background: var(--surface); border-radius: 6px; color: var(--ink-soft); }
.tag.pack { color: var(--primary); }
.winner-banner { display: inline-flex; align-items: center; gap: 8px; font-weight: 900; font-size: clamp(18px, 3vw, 26px); color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, var(--surface)); border: var(--bd) solid var(--primary); border-radius: 999px; padding: 8px 20px; }
.call-card { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.kicker { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); font-size: 14px; }
.big-call { font-weight: 900; font-size: clamp(34px, 8vw, 84px); line-height: 1.02; max-width: 18ch; }
.big-call.dim { color: var(--ink-soft); font-size: clamp(20px, 4vw, 34px); font-weight: 800; }
.called-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 920px; }
.called-chip { padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 14px; background: var(--surface); border: var(--bd) solid var(--line-soft); color: var(--ink-soft); }
.called-chip.latest { background: var(--primary); color: var(--primary-ink); border-color: var(--line); }
.winners { list-style: none; margin: 0; padding: 10px 0 0; display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; font-weight: 700; }
.winners b { color: var(--primary); }
.ctrls { margin-top: auto; display: flex; gap: 12px; align-items: center; }
.loading { color: var(--ink-soft); }
@media (max-width: 900px) { .lobby { grid-template-columns: 1fr; } }
</style>
