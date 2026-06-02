<script setup lang="ts">
/** Phone reveal for Most Likely To: who the room landed on, and who you picked. */
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { MostLikelyContent, MostLikelyInput, MostLikelyRevealSummary } from './block'

const props = defineProps<{
  content: MostLikelyContent
  myInput?: MostLikelyInput | null
  reveal?: MostLikelyRevealSummary | null
}>()

const myPick = computed(() => props.myInput?.name ?? '')
const winner = computed(() => props.reveal?.winnerName ?? '')
const agreed = computed(() => !!myPick.value && myPick.value === winner.value)
</script>

<template>
  <div class="ml-reveal big" aria-live="polite">
    <div class="badge" aria-hidden="true"><Icon name="crown" :size="34" /></div>
    <h2 v-if="winner">The room says {{ winner }}</h2>
    <h2 v-else>It's a wash</h2>
    <p v-if="myPick">
      You pointed at <b>{{ myPick }}</b><template v-if="agreed"> - same as the room.</template>
    </p>
    <p v-else>You didn't vote this round.</p>
  </div>
</template>

<style scoped>
.ml-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.badge {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 36px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.ml-reveal h2 { font-size: clamp(26px, 7vw, 38px); font-weight: 800; }
.ml-reveal p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.ml-reveal b { color: var(--ink); }
</style>
