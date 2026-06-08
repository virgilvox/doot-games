<script setup lang="ts">
/** Phone reveal for a Survey round: the board with the player's own matches
 *  highlighted + their score. Recomputed from the player's own guesses + the
 *  published board (the same tolerant matcher the host scored with). */
import { computed } from 'vue'
import { matchAnswer } from '../text-match'
import type { SurveyAnswer, SurveyContent, SurveyInput } from './logic'

interface Reveal {
  answers: SurveyAnswer[]
  hits: number[]
}
const props = defineProps<{ content: SurveyContent; myInput?: SurveyInput | null; reveal?: Reveal | null }>()

const board = computed(() => props.reveal?.answers ?? [])
const myHits = computed(() => {
  const matched = new Set<number>()
  for (const g of props.myInput?.guesses ?? []) {
    const t = (g ?? '').trim()
    if (!t) continue
    const idx = board.value.findIndex((a) => matchAnswer(t, [a.text], { fuzzy: true }))
    if (idx >= 0) matched.add(idx)
  }
  return matched
})
const total = computed(() => [...myHits.value].reduce((s, i) => s + (board.value[i]?.points ?? 0), 0))
</script>

<template>
  <div class="survey-reveal big" aria-live="polite">
    <h2>You scored {{ total }}</h2>
    <ol class="board">
      <li v-for="(a, i) in board" :key="i" :class="{ mine: myHits.has(i) }">
        <span class="btext">{{ a.text }}</span>
        <span class="bpts mono">{{ a.points }}</span>
      </li>
    </ol>
    <p class="foot">Your matches are highlighted.</p>
  </div>
</template>

<style scoped>
.survey-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}
.survey-reveal h2 {
  font-size: clamp(26px, 7vw, 36px);
  font-weight: 800;
}
.board {
  list-style: none;
  display: grid;
  gap: 7px;
  width: 100%;
  max-width: 360px;
}
.board li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 14px;
  opacity: 0.6;
}
.board li.mine {
  opacity: 1;
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 12%, var(--surface-2));
}
.btext {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.bpts {
  font-weight: 800;
  color: var(--c5);
}
.foot {
  color: var(--ink-soft);
  font-size: 14px;
}
</style>
