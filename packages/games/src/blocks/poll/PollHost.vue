<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { OptionGrid } from '@doot-games/ui'
import { type ComputedRef, computed, inject } from 'vue'
import type { PollContent, PollInput } from './block'

const props = defineProps<{
  content: PollContent
  inputs: Map<string, RelayValue>
  state: RoundState
  answer?: unknown
}>()

const counts = computed(() => {
  const out = props.content.options.map(() => 0)
  for (const input of props.inputs.values()) {
    const choice = (input as PollInput | null)?.choice
    if (choice != null && out[choice] != null) out[choice]++
  }
  return out
})

// P4B: fold in the audience's votes as a capped "crowd" bloc, so a big spectator
// crowd influences the poll but never drowns out the room. The bloc is worth at most
// a roomful of votes (max(3, players)), distributed by the crowd's own vote split.
const audienceVotes = inject<ComputedRef<Map<string, RelayValue>> | undefined>('dootAudienceVotes', undefined)
const crowdCounts = computed(() => {
  const out = props.content.options.map(() => 0)
  const m = audienceVotes?.value
  if (m) for (const v of m.values()) {
    const c = (v as PollInput | null)?.choice
    if (c != null && out[c] != null) out[c]++
  }
  return out
})
const crowdTotal = computed(() => crowdCounts.value.reduce((a, b) => a + b, 0))
const playerTotal = computed(() => counts.value.reduce((a, b) => a + b, 0))
const combined = computed(() => {
  if (!crowdTotal.value) return counts.value
  const cap = Math.max(3, playerTotal.value)
  return counts.value.map((c, i) => c + Math.round((cap * (crowdCounts.value[i] ?? 0)) / crowdTotal.value))
})
</script>

<template>
  <div class="poll-host">
    <OptionGrid :options="content.options" :counts="state === 'ready' ? null : combined" disabled />
    <p v-if="crowdTotal && state !== 'ready'" class="crowd-note">
      Includes the crowd ({{ crowdTotal }} watching voted)
    </p>
  </div>
</template>

<style scoped>
.poll-host {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.crowd-note {
  text-align: center;
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-soft);
}
</style>
