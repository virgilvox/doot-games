<script setup lang="ts">
/**
 * Full-custom Player. A custom view replaces the generic GamePlayer entirely, so
 * it reaches the live room with `injectDootRoom()` and renders every phase
 * itself. The engine still owns the relay, room, and state machine.
 *
 * The room exposes reactive reads (`phase`, `round`, `me`, ...) and actions
 * (`submit`, ...). Here: when voting is open, every tap submits an incrementing
 * count; otherwise we show a waiting/lobby/results message.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed, ref } from 'vue'

defineProps<{ plugin: unknown }>() // the renderer passes :plugin; unused here
const room = injectDootRoom()

const taps = ref(0)
const open = computed(() => room.phase.value === 'active' && room.round.value.state === 'open')

function tap() {
  if (!open.value) return
  taps.value++
  room.submit({ taps: taps.value }) // published to the relay as this player's input
}
</script>

<template>
  <div class="tap-player">
    <div v-if="room.phase.value === 'lobby'" class="msg"><h2>You're in!</h2><p>Wait for the host to start.</p></div>
    <button v-else-if="open" class="tap-btn" @click="tap">TAP! <span class="n">{{ taps }}</span></button>
    <div v-else-if="room.phase.value === 'results'" class="msg"><h2>Done!</h2><p>Check the big screen.</p></div>
    <div v-else class="msg"><h2>Get ready…</h2><p>Tapping opens in a moment.</p></div>
  </div>
</template>

<style scoped>
.tap-player { display: flex; flex: 1; align-items: center; justify-content: center; }
.tap-btn {
  width: 100%;
  aspect-ratio: 1;
  max-width: 320px;
  border-radius: 50%;
  border: var(--bd) solid var(--line);
  background: var(--primary);
  color: var(--primary-ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 40px;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.tap-btn:active { transform: scale(0.97); }
.tap-btn .n { display: block; font-size: 64px; }
.msg { text-align: center; }
.msg h2 { font-size: 32px; font-weight: 800; }
.msg p { color: var(--ink-soft); margin-top: 6px; }
</style>
