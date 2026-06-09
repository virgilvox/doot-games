<script setup lang="ts">
/**
 * Big-screen Answer view. While players type it shows only a COUNT (showing the
 * typed answers would let people copy each other). At reveal it shows THE answer
 * big, how many got it, and who nailed it (with what they typed). The host has the
 * answer key + every input at reveal, so it grades with the same shared matcher.
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import type { AnswerAnswer, AnswerContent, AnswerInput } from './block'
import { matchAnswer } from '../text-match'

const props = defineProps<{
  content: AnswerContent
  inputs: Map<string, AnswerInput>
  state: RoundState
  answer?: unknown
}>()

const done = computed(() => props.state === 'reveal')
const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.text?.trim()) n++
  return n
})
const accepted = computed(() => {
  const a = (props.answer as AnswerAnswer | undefined)?.answers
  return Array.isArray(a) ? a : []
})
const theAnswer = computed(() => accepted.value[0] ?? '')
const winners = computed(() => {
  const out: string[] = []
  for (const v of props.inputs.values()) {
    const text = v?.text?.trim()
    if (text && matchAnswer(text, accepted.value, { fuzzy: props.content.fuzzy })) out.push(text)
  }
  return out
})
</script>

<template>
  <div class="answer-host">
    <template v-if="!done">
      <div class="big-count">
        <span class="num mono">{{ count }}</span>
        <span class="lbl">{{ state === 'locked' ? 'answers locked in' : 'answers so far' }}</span>
      </div>
      <div v-if="state !== 'locked'" class="dots" aria-hidden="true"><span /><span /><span /></div>
      <p class="hint">{{ state === 'locked' ? 'Let’s see who got it…' : 'Type what you think…' }}</p>
    </template>
    <template v-else>
      <p class="kicker">The answer</p>
      <h3 class="reveal-answer">{{ theAnswer || 'No answer set' }}</h3>
      <p class="tally">{{ winners.length }} of {{ count }} got it</p>
      <ul v-if="winners.length" class="winners">
        <li v-for="(w, i) in winners.slice(0, 8)" :key="i" class="win mono">{{ w }}</li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.answer-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 220px;
  text-align: center;
}
.big-count {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  font-size: clamp(56px, 12vw, 120px);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 14px;
}
.dots {
  display: flex;
  gap: 10px;
}
.dots span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--c3);
  animation: pop 1.2s ease-in-out infinite;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pop {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}
.hint { color: var(--ink-soft); font-weight: 600; }
.kicker {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 800;
  font-size: 13px;
  color: var(--ink-soft);
}
.reveal-answer {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(32px, 7vw, 64px);
  color: var(--primary);
  overflow-wrap: anywhere;
}
.tally { font-weight: 700; color: var(--ink-soft); }
.winners {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: min(680px, 92%);
}
.win {
  background: color-mix(in srgb, var(--c5) 16%, var(--surface-2));
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 15px;
  overflow-wrap: anywhere;
}
</style>
