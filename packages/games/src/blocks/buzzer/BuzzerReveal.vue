<script setup lang="ts">
/**
 * Phone reveal for a gameshow question. Tells the player whether they were right
 * (and how many points), and — the gameshow moment — if THEY were the fastest
 * correct answerer, their phone DINGS and celebrates "you buzzed in first!" so
 * the team can spot who it was in the room.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { Icon, playDing } from '@doot-games/ui'
import { computed, onMounted } from 'vue'
import type { BuzzerContent, BuzzerInput, BuzzerRevealSummary } from './block'

const props = defineProps<{
  content: BuzzerContent
  myInput?: BuzzerInput | null
  reveal?: BuzzerRevealSummary | null
}>()

const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

const answered = computed(() => props.myInput?.choice != null)
const correct = computed(() => answered.value && props.myInput?.choice === props.reveal?.correctIndex)
const iBuzzedFirst = computed(() => correct.value && props.reveal?.firstCorrect?.pid === myId.value)
const answerLabel = computed(() => props.reveal?.correctLabel ?? '')
const answerSublabel = computed(() => {
  const i = props.reveal?.correctIndex
  return i != null && i >= 0 ? (props.content.options[i]?.sublabel ?? '') : ''
})

onMounted(() => {
  if (iBuzzedFirst.value) playDing()
})
</script>

<template>
  <div class="buzzer-reveal big">
    <template v-if="iBuzzedFirst">
      <div class="bell"><Icon name="bell" :size="48" /></div>
      <h2>You buzzed in first!</h2>
      <p>Fastest correct answer in the room. Take a bow.</p>
    </template>
    <template v-else-if="correct">
      <div class="badge ok" aria-hidden="true">&#10003;</div>
      <h2>Correct!</h2>
      <p>Nice. Check the big screen for the standings.</p>
    </template>
    <template v-else-if="answered">
      <div class="badge no" aria-hidden="true">&#10007;</div>
      <h2>Not quite</h2>
      <p>The answer was <b>{{ answerLabel }}</b><template v-if="answerSublabel"> ({{ answerSublabel }})</template>.</p>
    </template>
    <template v-else>
      <div class="badge no" aria-hidden="true">&#8211;</div>
      <h2>Time!</h2>
      <p>The answer was <b>{{ answerLabel }}</b><template v-if="answerSublabel"> ({{ answerSublabel }})</template>.</p>
    </template>
  </div>
</template>

<style scoped>
.buzzer-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}
.bell {
  font-size: clamp(64px, 22vw, 110px);
  line-height: 1;
  animation: ring 0.6s ease-in-out 3;
  transform-origin: top center;
}
@keyframes ring {
  0%,
  100% {
    transform: rotate(0);
  }
  25% {
    transform: rotate(16deg);
  }
  75% {
    transform: rotate(-16deg);
  }
}
.badge {
  width: clamp(64px, 18vw, 96px);
  height: clamp(64px, 18vw, 96px);
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: clamp(34px, 10vw, 52px);
  font-weight: 900;
  border: var(--bd) solid var(--line);
}
.badge.ok {
  background: color-mix(in srgb, var(--c5) 22%, var(--surface));
  color: var(--c5);
}
.badge.no {
  background: var(--surface-2);
  color: var(--ink-soft);
}
.buzzer-reveal h2 {
  font-size: clamp(28px, 8vw, 40px);
  font-weight: 800;
}
.buzzer-reveal p {
  color: var(--ink-soft);
  max-width: 30ch;
  line-height: 1.45;
}
</style>
