<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { OptionGrid } from '@doot-games/ui'
import { computed } from 'vue'
import type { GuessContent, GuessInput } from './block'

const props = defineProps<{
  content: GuessContent
  inputs: Map<string, RelayValue>
  state: RoundState
  answer?: unknown
}>()

const counts = computed(() => {
  const out = props.content.options.map(() => 0)
  for (const input of props.inputs.values()) {
    const choice = (input as GuessInput | null)?.choice
    if (choice != null && out[choice] != null) out[choice]++
  }
  return out
})
const correct = computed(() => (props.answer as { correct?: number } | undefined)?.correct ?? null)
</script>

<template>
  <OptionGrid
    :options="content.options"
    :counts="state === 'ready' ? null : counts"
    :correct="correct"
    :revealed="state === 'reveal'"
    disabled
  />
</template>
