<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { VoteBars } from '@doot-games/ui'
import { computed } from 'vue'
import { type RateContent, type RateInput, scaleMax } from './block'

const props = defineProps<{
  content: RateContent
  inputs: Map<string, RelayValue>
  state: RoundState
  answer?: unknown
}>()

const bars = computed(() => {
  const max = scaleMax(props.content.scale)
  return props.content.categories.map((cat) => {
    let sum = 0
    let n = 0
    for (const input of props.inputs.values()) {
      const v = (input as RateInput | null)?.ratings?.[cat.id]
      if (typeof v === 'number') {
        sum += v
        n++
      }
    }
    return {
      label: cat.label,
      value: n ? sum / n : 0,
      max,
      note: n ? `${n} rating${n === 1 ? '' : 's'}` : 'waiting for ratings',
    }
  })
})
</script>

<template>
  <VoteBars :bars="bars" />
</template>
