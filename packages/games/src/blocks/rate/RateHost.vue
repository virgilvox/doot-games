<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { VoteBars } from '@doot-games/ui'
import { computed } from 'vue'
import { type RateContent, type RateInput, formatScore, scaleMax, scaleMin } from './block'

const props = defineProps<{
  content: RateContent
  inputs: Map<string, RelayValue>
  state: RoundState
  answer?: unknown
}>()

const bars = computed(() => {
  const { scale } = props.content
  const min = scaleMin(scale)
  const max = scaleMax(scale)
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
    const avg = n ? sum / n : min
    return {
      label: cat.label,
      value: avg,
      min,
      max,
      // Show the tier/grade label (e.g. "B") rather than the raw average.
      display: n ? formatScore(avg, scale) : '—',
      note: n ? `${n} rating${n === 1 ? '' : 's'}` : 'waiting for ratings',
    }
  })
})
</script>

<template>
  <VoteBars :bars="bars" />
</template>
