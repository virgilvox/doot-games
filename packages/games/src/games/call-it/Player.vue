<script setup lang="ts">
/**
 * Call It phone surface. Reads the host's `/x/call` (the current prediction + phase) and
 * `/x/board` (the running standings). The player's pick is published per call
 * (`/x/pick/<i>/<pid>`) AND read back from that retained channel, so a phone that drops
 * and rejoins re-derives its pick for the live call (no local-only state to lose): the
 * selection, the locked-screen confirmation, and the result narration all survive a
 * reconnect, honoring the platform's reconnect-by-name promise. The host scores.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { Icon } from '@doot-games/ui'
import { computed, onMounted, ref } from 'vue'
import GameResults from '../../runtime/GameResults.vue'
import type { CallState, LeaderRow } from './logic'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

const call = ref<CallState | null>(null)
const board = ref<LeaderRow[]>([])
// Picks keyed by call index, rehydrated from the retained pick channel on (re)connect.
const myPicks = ref<Record<number, number>>({})

onMounted(() => {
  room.onExtra('call', (v) => {
    call.value = (v as CallState | null) ?? null
  })
  room.onExtra('board', (v) => {
    board.value = (v as { rows?: LeaderRow[] } | null)?.rows ?? []
  })
  // My own picks (retained per call) replay on subscribe, so a reconnect restores them.
  room.onExtra(`pick/*/${myId.value}`, (v, key) => {
    const i = Number(key.split('/')[1])
    const choice = (v as { choice?: number } | null)?.choice
    if (Number.isInteger(i) && Number.isInteger(choice)) myPicks.value = { ...myPicks.value, [i]: choice as number }
  })
})

const phase = computed(() => call.value?.phase ?? null)
const myPick = computed(() => (call.value ? myPicks.value[call.value.i] ?? null : null))
const myRow = computed(() => board.value.find((r) => r.id === myId.value) ?? null)
const amRight = computed(() => !!call.value && call.value.outcome != null && call.value.outcome === myPick.value)

const headKicker = computed(() => (phase.value === 'result' ? 'Result' : phase.value === 'locked' ? 'Picks closed' : 'Your call'))
const status = computed(() => {
  const c = call.value
  if (!c) return ''
  if (phase.value === 'open') return myPick.value != null ? `You called ${c.options[myPick.value]}. Tap another to change it.` : 'Tap your call.'
  if (phase.value === 'locked') return myPick.value != null ? `You called ${c.options[myPick.value]}. Picks are closed.` : 'Picks are closed, no pick in.'
  if (c.outcome == null) return 'That one was voided. No points.'
  return amRight.value ? 'You called it!' : 'Not this time.'
})

function pick(i: number) {
  const c = call.value
  if (!c || c.phase !== 'open') return
  myPicks.value = { ...myPicks.value, [c.i]: i }
  room.publishExtra(`pick/${c.i}/${myId.value}`, { choice: i })
}
</script>

<template>
  <div class="callit-player">
    <div v-if="!room.ready.value" class="big">Joining...</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You're in</h2>
      <p>When the host poses a call, pick what you think happens. Calling it right scores. Keep this open.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="!call" class="big"><h2>Waiting for the first call...</h2></div>

    <template v-else>
      <div class="head">
        <span class="kicker">{{ headKicker }}</span>
        <span v-if="myRow" class="badge">{{ myRow.score }} pts</span>
      </div>
      <h2 class="q">{{ call.prompt }}</h2>
      <p class="status" role="status" aria-live="polite">{{ status }}</p>

      <!-- open: pick -->
      <div v-if="phase === 'open'" class="opts">
        <button v-for="(o, i) in call.options" :key="i" type="button" class="opt" :class="{ on: myPick === i }" :aria-pressed="myPick === i" @click="pick(i)">{{ o }}</button>
      </div>

      <!-- result -->
      <div v-else-if="phase === 'result' && call.outcome != null" class="result-card" :class="{ win: amRight }">
        <Icon v-if="amRight" name="crown" :size="22" />
        <span v-if="amRight">You called it! <b>{{ call.options[call.outcome] }}</b></span>
        <span v-else-if="myPick != null">It was <b>{{ call.options[call.outcome] }}</b>. You called {{ call.options[myPick] }}.</span>
        <span v-else>It was <b>{{ call.options[call.outcome] }}</b>.</span>
      </div>
      <!-- how the room split (the tally rides the result call) -->
      <p v-if="phase === 'result' && call.outcome != null && call.tally.some((n) => n > 0)" class="spread">
        {{ call.options.map((o, i) => `${o} ${call?.tally[i] ?? 0}`).join(' · ') }}
      </p>

      <p v-if="phase !== 'open'" class="hint">{{ phase === 'result' ? 'Next call coming up on the big screen.' : 'Watch the big screen for the outcome.' }}</p>
    </template>
  </div>
</template>

<style scoped>
.callit-player { display: flex; flex-direction: column; gap: 12px; flex: 1; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kicker { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); }
.badge { font-weight: 800; font-size: 12px; color: var(--primary-ink); background: var(--primary); border-radius: 999px; padding: 4px 10px; }
.q { text-align: center; font-size: clamp(20px, 5.5vw, 28px); font-weight: 800; line-height: 1.2; }
.status { margin: 0; text-align: center; color: var(--ink-soft); font-weight: 600; font-size: 14px; }
.opts { display: flex; flex-direction: column; gap: 12px; }
.opt { font: inherit; font-weight: 800; font-size: clamp(18px, 5vw, 22px); padding: 18px; border-radius: var(--radius-lg); border: 3px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; box-shadow: var(--shadow-sm); transition: transform 0.06s ease; }
.opt:active { transform: scale(0.97); }
.opt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 16%, var(--surface)); }
.result-card { display: flex; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 18px; border-radius: var(--radius-lg); border: var(--bd) solid var(--line); background: var(--surface-2); font-weight: 700; font-size: clamp(16px, 4.5vw, 20px); }
.spread { margin: 0; text-align: center; color: var(--ink-soft); font-weight: 700; font-size: 14px; }
.result-card.win { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, var(--surface-2)); color: var(--primary); }
.result-card b { color: var(--ink); }
.result-card.win b { color: var(--primary); }
.hint { text-align: center; color: var(--ink-soft); font-weight: 600; font-size: 14px; }
.big { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; }
.big h2 { font-size: clamp(24px, 6.5vw, 34px); font-weight: 800; }
.big p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
</style>
