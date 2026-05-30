<script setup lang="ts">
/**
 * Full-custom Host. Replaces the generic GameHost, so it renders every phase
 * (lobby / active / results) itself and drives the room with `room.host.*`
 * actions. The engine validates which actions are legal via `room.host.can(...)`.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { RelayValue } from '@doot-games/engine'
import { computed } from 'vue'
import TapResults from './TapResults.vue'

defineProps<{ plugin: unknown }>()
const room = injectDootRoom()

// Live tap totals: read every player's latest input for round 0.
const board = computed(() => {
  const inputs = room.inputsFor(0) as Map<string, { taps?: number }>
  return room.players.value
    .map((p) => ({ id: p.id, name: p.name, taps: inputs.get(p.id)?.taps ?? 0 }))
    .sort((a, b) => b.taps - a.taps)
})

function end() {
  // Compute a StandardResults leaderboard and publish it; the engine moves the
  // room to the results phase for everyone.
  const summary = {
    headline: board.value[0]?.taps ? `${board.value[0].name} wins!` : 'The results are in',
    leaderboard: board.value.map((b) => ({ id: b.id, name: b.name, score: b.taps, detail: `${b.taps} taps` })),
  }
  room.host.finish(summary as unknown as RelayValue)
}
</script>

<template>
  <div class="tap-host">
    <!-- LOBBY -->
    <div v-if="room.phase.value === 'lobby'" class="center">
      <h1>Tap Battle</h1>
      <p>Room code: <b class="mono">{{ room.runtime.room }}</b></p>
      <p>{{ room.players.value.length }} in the room</p>
      <button class="btn btn-primary btn-lg" :disabled="!room.config.value" @click="room.host.start()">Start</button>
    </div>

    <!-- RESULTS (delegate to the custom Results view) -->
    <TapResults v-else-if="room.phase.value === 'results'" :plugin="null" />

    <!-- ACTIVE -->
    <div v-else class="center">
      <h1>TAP!</h1>
      <ul class="board">
        <li v-for="b in board" :key="b.id"><span>{{ b.name }}</span><b class="mono">{{ b.taps }}</b></li>
      </ul>
      <button v-if="room.host.can('open')" class="btn btn-primary btn-lg" @click="room.host.openVoting()">Open tapping</button>
      <button v-else class="btn btn-primary btn-lg" @click="end()">End &amp; show results</button>
    </div>
  </div>
</template>

<style scoped>
.center { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 30px; }
.center h1 { font-size: clamp(36px, 7vw, 64px); font-weight: 800; }
.board { list-style: none; width: min(420px, 90%); display: grid; gap: 8px; }
.board li { display: flex; justify-content: space-between; background: var(--surface-2); border: var(--bd) solid var(--line-soft); border-radius: 12px; padding: 12px 16px; font-weight: 700; }
</style>
