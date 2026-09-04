<script setup lang="ts">
import type { RelayValue, RoundState } from '@doot-games/engine'
import { VoteBars, WinnerBoard } from '@doot-games/ui'
import { computed } from 'vue'
import { type RankContent, type RankInput, avgPlaceNote, consensus, place } from './block'

const props = defineProps<{
  content: RankContent
  inputs: Map<string, RelayValue>
  state: RoundState
  answer?: unknown
}>()

const voted = computed(() => props.inputs.size)
const ranked = computed(() => consensus(props.content, props.inputs as unknown as Map<string, RankInput>))

// The reveal is the payoff, so the big screen switches from the live tally to the
// board: the room's #1 large (with its picture, when the item has one) and the
// whole rest of the order underneath. While voting is still open it stays a chart,
// which reads better as a thing that is still moving.
const revealed = computed(() => props.state === 'reveal' && voted.value > 0)

const board = computed(() =>
  ranked.value.map((r) => ({
    id: r.id,
    label: r.label,
    ...(r.image ? { image: r.image } : {}),
    // Items the room placed level share a place, so a dead heat never reads as an
    // order the room did not actually choose.
    place: place(ranked.value, r),
    note: avgPlaceNote(r.avg, props.content.items.length),
  })),
)

const bars = computed(() => {
  const n = props.content.items.length
  // Before anyone has ranked, consensus falls back to the items' original order;
  // showing that as a #1..#n ladder with descending bars (and an "avg") reads like
  // a result that doesn't exist yet. Until the first ranking lands, show the items
  // as a neutral, equal list with no rank numbers or averages.
  if (voted.value === 0) {
    return ranked.value.map((r) => ({ label: r.label, value: 0, max: n, display: '' }))
  }
  return ranked.value.map((r, rank) => ({
    label: r.label,
    value: n - rank,
    max: n,
    display: place(ranked.value, r),
    note: avgPlaceNote(r.avg, n),
  }))
})
</script>

<template>
  <div class="rank-host">
    <WinnerBoard v-if="revealed" :entries="board" />
    <VoteBars v-else :bars="bars" />
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
