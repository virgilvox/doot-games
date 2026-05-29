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

const bars = computed(() => {
  const ranked = consensus(props.content, props.inputs as unknown as Map<string, RankInput>)
  const n = props.content.items.length
  return ranked.map((r, rank) => ({
    label: r.label,
    value: n - rank,
    max: n,
    display: `#${rank + 1}`,
    note: `avg ${r.avg.toFixed(1)}`,
  }))
})
const voted = computed(() => props.inputs.size)
</script>

<template>
  <div class="rank-host">
    <VoteBars :bars="bars" />
    <p class="voted mono">{{ voted }} ranked</p>
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
