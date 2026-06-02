<script setup lang="ts">
/** Phone reveal for Ballpark: the answer, your guess, and how close you were. */
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { BallparkContent, BallparkInput, BallparkRevealSummary } from './block'

const props = defineProps<{
  content: BallparkContent
  myInput?: BallparkInput | null
  reveal?: BallparkRevealSummary | null
}>()

const answer = computed(() => props.reveal?.answer ?? null)
const unit = computed(() => props.reveal?.unit ?? '')
const myValue = computed(() => props.myInput?.value ?? null)
const guessed = computed(() => myValue.value != null && Number.isFinite(myValue.value))
const myError = computed(() =>
  guessed.value && answer.value != null ? Math.abs((myValue.value as number) - answer.value) : null,
)
const minError = computed(() => {
  const marks = props.reveal?.marks ?? []
  if (!marks.length || answer.value == null) return null
  return Math.min(...marks.map((m) => Math.abs(m.value - (answer.value as number))))
})
const wasClosest = computed(
  () => myError.value != null && minError.value != null && myError.value === minError.value,
)
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
</script>

<template>
  <div class="bp-reveal big" aria-live="polite">
    <div v-if="wasClosest" class="badge ok" aria-hidden="true"><Icon name="crown" :size="34" /></div>
    <h2 v-if="answer != null">{{ fmt(answer) }}<small v-if="unit"> {{ unit }}</small></h2>
    <h2 v-else>Answer in</h2>
    <p v-if="!guessed">You didn't lock in a number.</p>
    <p v-else-if="wasClosest"><b>Closest guess!</b> You said {{ fmt(myValue as number) }}.</p>
    <p v-else>
      You said {{ fmt(myValue as number) }} - off by <b>{{ myError != null ? fmt(myError) : '?' }}</b>.
    </p>
  </div>
</template>

<style scoped>
.bp-reveal {
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
  font-size: 34px;
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.badge.ok { background: color-mix(in srgb, var(--c5) 22%, var(--surface)); color: var(--c5); }
.badge.no { background: var(--surface-2); color: var(--ink-soft); }
.bp-reveal h2 { font-size: clamp(34px, 10vw, 52px); font-weight: 800; color: var(--c5); }
.bp-reveal h2 small { font-size: 0.45em; color: var(--ink-soft); font-weight: 700; }
.bp-reveal p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.bp-reveal b { color: var(--ink); }
</style>
