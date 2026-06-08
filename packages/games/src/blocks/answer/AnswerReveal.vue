<script setup lang="ts">
/**
 * Phone reveal for an Answer round: grade the player on THEIR screen (the
 * second-screen promise) using the same tolerant matcher the host scored with.
 * The phone doesn't know its own pid, so it regrades its own typed answer against
 * the accepted list the reveal makes public.
 */
import { computed } from 'vue'
import type { AnswerContent, AnswerInput, AnswerRevealSummary } from './block'
import { matchAnswer } from '../text-match'

const props = defineProps<{
  content: AnswerContent
  myInput?: AnswerInput | null
  reveal?: AnswerRevealSummary | null
}>()

const myText = computed(() => props.myInput?.text?.trim() ?? '')
const answered = computed(() => myText.value.length > 0)
const fuzzy = computed(() => props.reveal?.fuzzy ?? props.content.fuzzy)
const correct = computed(
  () => answered.value && matchAnswer(myText.value, props.reveal?.accepted ?? [], { fuzzy: fuzzy.value }),
)
const theAnswer = computed(() => props.reveal?.answer ?? '')
</script>

<template>
  <div class="answer-reveal big" aria-live="polite">
    <template v-if="correct">
      <div class="badge ok" aria-hidden="true">&#10003;</div>
      <h2>Correct!</h2>
      <p>Nice one. Check the big screen for the standings.</p>
    </template>
    <template v-else-if="answered">
      <div class="badge no" aria-hidden="true">&#10007;</div>
      <h2>Not quite</h2>
      <p>You said <b>{{ myText }}</b>. The answer was <b>{{ theAnswer }}</b>.</p>
    </template>
    <template v-else>
      <div class="badge no" aria-hidden="true">&#8211;</div>
      <h2>Time!</h2>
      <p>The answer was <b>{{ theAnswer }}</b>.</p>
    </template>
  </div>
</template>

<style scoped>
.answer-reveal {
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
.answer-reveal h2 { font-size: clamp(28px, 8vw, 40px); font-weight: 800; }
.answer-reveal p { color: var(--ink-soft); max-width: 32ch; line-height: 1.45; }
.answer-reveal b { color: var(--ink); overflow-wrap: anywhere; }
</style>
