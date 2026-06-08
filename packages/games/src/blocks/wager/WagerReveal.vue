<script setup lang="ts">
/** Phone reveal for a Wager round: did your bet pay off? Shows the swing and the
 *  correct answer, computed from the player's own bet + choice. */
import { computed } from 'vue'
import type { WagerContent, WagerInput, WagerRevealSummary } from './block'

const props = defineProps<{
  content: WagerContent
  myInput?: WagerInput | null
  reveal?: WagerRevealSummary | null
}>()

const answered = computed(() => props.myInput?.choice != null)
const correct = computed(() => answered.value && props.myInput?.choice === props.reveal?.correctIndex)
const bet = computed(() => props.myInput?.bet ?? 0)
const answerLabel = computed(() => props.reveal?.correctLabel ?? '')
</script>

<template>
  <div class="wager-reveal big" aria-live="polite">
    <template v-if="correct">
      <div class="badge ok" aria-hidden="true">&#10003;</div>
      <h2>+{{ bet }}</h2>
      <p>Your bet paid off. Check the big screen for the standings.</p>
    </template>
    <template v-else-if="answered">
      <div class="badge no" aria-hidden="true">&#10007;</div>
      <h2>&#8722;{{ bet }}</h2>
      <p>The answer was <b>{{ answerLabel }}</b>. Win it back next round.</p>
    </template>
    <template v-else>
      <div class="badge no" aria-hidden="true">&#8211;</div>
      <h2>No bet</h2>
      <p>The answer was <b>{{ answerLabel }}</b>.</p>
    </template>
  </div>
</template>

<style scoped>
.wager-reveal {
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
  font-size: 38px;
  font-weight: 800;
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.badge.ok { background: color-mix(in srgb, var(--c5) 22%, var(--surface)); color: var(--c5); }
.badge.no { background: var(--surface-2); color: var(--ink-soft); }
.wager-reveal h2 { font-size: clamp(32px, 9vw, 48px); font-weight: 800; }
.wager-reveal p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.wager-reveal b { color: var(--ink); }
</style>
