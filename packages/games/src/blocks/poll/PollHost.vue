<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { OptionGrid } from '@doot-games/ui'
import { computed } from 'vue'
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
</script>

<template>
  <OptionGrid :options="content.options" :counts="state === 'ready' ? null : counts" disabled />
</template>
