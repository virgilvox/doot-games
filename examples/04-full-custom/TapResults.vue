<script setup lang="ts">
/**
 * Full-custom Results. You can render results however you like, or reuse the
 * shared widgets (Leaderboard, VoteBars, StatStrip, ConfettiBurst) from
 * @doot-games/ui. Here we reuse Leaderboard + ConfettiBurst over the summary the
 * host published via `room.host.finish(...)`.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { ConfettiBurst, Leaderboard } from '@doot-games/ui'
import { computed } from 'vue'

defineProps<{ plugin: unknown }>()
const room = injectDootRoom()
const results = computed(() => (room.results.value ?? {}) as { headline?: string; leaderboard?: [] })
</script>

<template>
  <div class="tap-results">
    <ConfettiBurst />
    <h1>{{ results.headline ?? 'The results are in' }}</h1>
    <Leaderboard :entries="results.leaderboard ?? []" />
  </div>
</template>

<style scoped>
.tap-results { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 30px; position: relative; }
.tap-results h1 { font-size: clamp(32px, 7vw, 60px); font-weight: 800; }
</style>
