<script setup lang="ts">
/**
 * Bingo phone surface. The player's card is dealt locally and deterministically from
 * the room seed + their own id (`buildCard`), so it is identical on every device and
 * survives a reconnect with no relay write. Cells **auto-mark** the moment their item is
 * called: a cell is covered iff it is the free center or its item is in the host's
 * retained `/x/calls`. That keeps the whole surface reconnect-safe by construction (a
 * phone that drops and rejoins re-derives the same card AND the same covered cells from
 * the retained call list, with zero per-player state to lose) and removes the finicky
 * tap-the-tiny-cell race; the player's one action is to slam BINGO when a line completes,
 * which the host verifies independently.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { Icon } from '@doot-games/ui'
import { computed, onMounted, ref, watch } from 'vue'
import GameResults from '../../runtime/GameResults.vue'
import { type BingoCard, buildCard, completedLines, freeIndex, isCovered } from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

interface Setup { packName: string; size: number; pool: string[] }
interface Result { winners: Array<{ pid: string; name: string; place: number }>; over: boolean }

const setup = ref<Setup | null>(null)
const calls = ref<string[]>([])
const result = ref<Result | null>(null)
const claimed = ref(false)
let claimTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  room.onExtra('setup', (v) => {
    setup.value = (v as Setup | null) ?? null
    claimed.value = false
  })
  room.onExtra('calls', (v) => {
    calls.value = (v as { calls?: string[] } | null)?.calls ?? []
  })
  room.onExtra('result', (v) => {
    result.value = (v as Result | null) ?? null
  })
})

const card = computed<BingoCard | null>(() => {
  const s = setup.value
  if (!s) return null
  return buildCard(room.runtime.room, myId.value, s.pool, s.size)
})
const calledSet = computed(() => new Set(calls.value))
const fi = computed(() => (card.value ? freeIndex(card.value.size) : null))
const lastCall = computed(() => (calls.value.length ? calls.value[calls.value.length - 1] : null))

function covered(i: number): boolean {
  return !!card.value && isCovered(card.value, i, calledSet.value)
}
function cellLabel(i: number): string {
  const c = card.value
  if (!c) return ''
  if (c.free && i === fi.value) return 'Free space, marked'
  const item = c.cells[i] || 'blank'
  return covered(i) ? `${item}, marked` : item
}

/** The first complete line (called + free), if any. Pure derive from the called set, so
 *  it lights up automatically; no marking required. */
const winningLine = computed<number[] | null>(() => {
  if (!card.value) return null
  return completedLines(card.value, calledSet.value)[0] ?? null
})
const lineSet = computed(() => new Set(winningLine.value ?? []))
const amWinner = computed(() => result.value?.winners.find((w) => w.pid === myId.value) ?? null)

const status = computed(() => {
  if (claimed.value) return amWinner.value ? 'Bingo confirmed. Watch the big screen.' : 'Checking your card...'
  if (winningLine.value) return 'You have a line. Tap Bingo to claim it.'
  if (lastCall.value) return `Just called: ${lastCall.value}`
  return 'Waiting for the first call...'
})

function claim() {
  if (!winningLine.value || claimed.value) return
  claimed.value = true
  room.publishExtra(`claim/${myId.value}`, { line: winningLine.value })
  // Safety net: if the host never confirms (a lost claim message), revert so the button
  // returns and the player can shout again rather than hang on "Checking..." forever.
  // Generous (8s) so a slow relay round-trip doesn't flap the button back mid-verify;
  // re-claims are keyed by pid on the host, so a repeat can never double-win.
  if (claimTimer) clearTimeout(claimTimer)
  claimTimer = setTimeout(() => {
    if (!amWinner.value) claimed.value = false
  }, 8000)
}

watch(amWinner, (w) => {
  if (w && claimTimer) {
    clearTimeout(claimTimer)
    claimTimer = null
  }
})
// A fresh deal (host restarts) clears the local claim flag.
watch(() => setup.value?.pool.length, () => { claimed.value = false })
</script>

<template>
  <div class="bingo-player">
    <div v-if="!room.ready.value" class="big">Joining...</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You're in</h2>
      <p>When the game starts you'll get your own card. Cells mark themselves as the host calls; tap Bingo when you complete a line.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="!card" class="big"><h2>Getting your card...</h2></div>

    <template v-else>
      <div class="head">
        <span class="kicker">{{ setup?.packName ?? 'Bingo' }}</span>
        <span v-if="amWinner" class="badge"><Icon name="crown" :size="14" /> Bingo #{{ amWinner.place }}</span>
      </div>

      <p class="callbar" role="status" aria-live="polite">{{ status }}</p>

      <ul class="grid" :style="{ gridTemplateColumns: `repeat(${card.size}, 1fr)` }" aria-label="Your bingo card">
        <li
          v-for="(item, i) in card.cells"
          :key="i"
          class="cell"
          :class="{ free: card.free && i === fi, covered: covered(i), win: lineSet.has(i) }"
          :aria-label="cellLabel(i)"
        >
          <span class="cell-t">{{ card.free && i === fi ? 'FREE' : item }}</span>
          <span v-if="covered(i)" class="dot" aria-hidden="true" />
        </li>
      </ul>

      <button v-if="winningLine && !claimed" class="btn btn-primary btn-block btn-lg bingo-btn" @click="claim"><Icon name="cheer" :size="20" /> Bingo!</button>
      <p v-else class="hint">{{ claimed && !amWinner ? 'Checking your card...' : amWinner ? 'Nice. You called it first.' : 'Your card fills itself, watch for a full line.' }}</p>
    </template>
  </div>
</template>

<style scoped>
.bingo-player { display: flex; flex-direction: column; gap: 12px; flex: 1; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kicker { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); }
.badge { display: inline-flex; align-items: center; gap: 5px; font-weight: 800; font-size: 12px; color: var(--primary-ink); background: var(--primary); border-radius: 999px; padding: 4px 10px; }
.callbar { margin: 0; text-align: center; font-weight: 700; font-size: clamp(14px, 4vw, 17px); color: var(--ink); background: var(--surface-2); border: var(--bd) solid var(--line-soft); border-radius: var(--radius); padding: 10px 12px; line-height: 1.3; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.cell {
  position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; padding: 4px;
  border-radius: 10px; border: var(--bd) solid var(--line-soft); background: var(--surface-2);
  color: var(--ink); font-weight: 700; overflow: hidden; transition: background 0.18s, border-color 0.18s;
}
.cell-t { font-size: clamp(9px, 2.6vw, 13px); line-height: 1.1; text-align: center; word-break: break-word; }
.cell.free { background: color-mix(in srgb, var(--c3) 22%, var(--surface-2)); border-color: var(--c3); font-weight: 900; }
.cell.covered { background: var(--primary); color: var(--primary-ink); border-color: var(--line); }
/* Non-color "marked" marker (a corner dot), so coverage is not signalled by color alone. */
.dot { position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 999px; background: var(--primary-ink); opacity: 0.9; }
.cell.free .dot, .cell.win .dot { background: var(--ink); }
.cell.win { background: color-mix(in srgb, var(--c3) 32%, var(--surface-2)); border-color: var(--c3); color: var(--ink); box-shadow: 0 0 0 2px var(--c3) inset; }
.bingo-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.hint { text-align: center; color: var(--ink-soft); font-weight: 600; font-size: 14px; }
.big { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; }
.big h2 { font-size: clamp(24px, 6.5vw, 34px); font-weight: 800; }
.big p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
</style>
