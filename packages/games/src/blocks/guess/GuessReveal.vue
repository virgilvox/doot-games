<script setup lang="ts">
/**
 * Phone reveal for a Guess round: tells the player on THEIR screen whether they
 * were right, instead of only pointing at the big screen (the second-screen
 * promise: a player who can't see the host still gets the game).
 */
import { computed } from 'vue'
import type { GuessContent, GuessInput } from './block'

const props = defineProps<{
  content: GuessContent
  myInput?: GuessInput | null
  reveal?: { correctIndex: number; correctLabel: string; revealImage?: string } | null
}>()

const answered = computed(() => props.myInput?.choice != null)
const correct = computed(
  () => answered.value && props.myInput?.choice === props.reveal?.correctIndex,
)
const answerLabel = computed(() => props.reveal?.correctLabel ?? '')
const answerSublabel = computed(() => {
  const i = props.reveal?.correctIndex
  return i != null && i >= 0 ? (props.content.options[i]?.sublabel ?? '') : ''
})
const answerImage = computed(() => {
  // The dedicated reveal picture is withheld from content and arrives in the reveal
  // payload; the correct option's own picture (if any) stays in content (it was a
  // visible choice). Prefer the reveal picture, fall back to the option's.
  const i = props.reveal?.correctIndex
  return props.reveal?.revealImage?.trim() || (i != null && i >= 0 ? (props.content.options[i]?.image ?? '') : '')
})
</script>

<template>
  <div class="guess-reveal big" aria-live="polite">
    <template v-if="correct">
      <div class="badge ok" aria-hidden="true">&#10003;</div>
      <h2>Correct!</h2>
      <p>Nice one. Check the big screen for the standings.</p>
    </template>
    <template v-else-if="answered">
      <div class="badge no" aria-hidden="true">&#10007;</div>
      <h2>Not quite</h2>
      <img v-if="answerImage" class="answer-img" :src="answerImage" alt="" />
      <p>The answer was <b>{{ answerLabel }}</b><template v-if="answerSublabel"> ({{ answerSublabel }})</template>.</p>
    </template>
    <template v-else>
      <div class="badge no" aria-hidden="true">&#8211;</div>
      <h2>Time!</h2>
      <img v-if="answerImage" class="answer-img" :src="answerImage" alt="" />
      <p>The answer was <b>{{ answerLabel }}</b><template v-if="answerSublabel"> ({{ answerSublabel }})</template>.</p>
    </template>
  </div>
</template>

<style scoped>
.guess-reveal {
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
.badge.ok {
  background: color-mix(in srgb, var(--c5) 22%, var(--surface));
  color: var(--c5);
}
.badge.no {
  background: var(--surface-2);
  color: var(--ink-soft);
}
.guess-reveal h2 {
  font-size: clamp(28px, 8vw, 40px);
  font-weight: 800;
}
.guess-reveal p {
  color: var(--ink-soft);
  max-width: 30ch;
  line-height: 1.45;
}
.guess-reveal b {
  color: var(--ink);
}
.answer-img {
  max-width: 100%;
  max-height: 38vh;
  object-fit: contain;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
}
</style>
