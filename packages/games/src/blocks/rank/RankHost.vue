<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { VoteBars } from '@doot-games/ui'
import { computed } from 'vue'
import { type RankContent, type RankInput, consensus } from './block'

const props = defineProps<{
  content: RankContent
  inputs: Map<string, RelayValue>
  state: RoundState
  answer?: unknown
}>()

const voted = computed(() => props.inputs.size)
const bars = computed(() => {
  const ranked = consensus(props.content, props.inputs as unknown as Map<string, RankInput>)
  const n = props.content.items.length
  // Before anyone has ranked, consensus falls back to the items' original order;
  // showing that as a #1..#n ladder with descending bars (and an "avg") reads like
  // a result that doesn't exist yet. Until the first ranking lands, show the items
  // as a neutral, equal list with no rank numbers or averages.
  if (voted.value === 0) {
    return ranked.map((r) => ({ label: r.label, value: 0, max: n, display: '' }))
  }
  return ranked.map((r, rank) => ({
    label: r.label,
    value: n - rank,
    max: n,
    display: `#${rank + 1}`,
    note: `avg ${r.avg.toFixed(1)}`,
  }))
})
</script>

<template>
  <div class="rank-host">
    <VoteBars :bars="bars" />
    <p class="voted mono">{{ voted === 0 ? 'Waiting for the first ranking…' : `${voted} ranked` }}</p>
  </div>
</template>

<style scoped>
.voted {
  margin-top: 12px;
  color: var(--ink-soft);
  font-size: 13px;
  text-align: right;
}
</style>
