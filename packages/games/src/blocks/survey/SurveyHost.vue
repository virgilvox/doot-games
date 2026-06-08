<script setup lang="ts">
/**
 * Big-screen Survey view. While players type it shows only a count (the board is
 * the answer key, hidden until reveal). At reveal it flips the "survey says" board:
 * each ranked answer, how many players found it, and its points.
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import { type SurveyAnswer, type SurveyContent, type SurveyInput, scoreSurvey } from './logic'

const props = defineProps<{
  content: SurveyContent
  inputs: Map<string, SurveyInput>
  state: RoundState
  answer?: unknown
}>()

const done = computed(() => props.state === 'reveal')
// At reveal the host holds the answer key (the board); before it, never shown.
const board = computed<SurveyAnswer[]>(
  () => (props.answer as { answers?: SurveyAnswer[] } | undefined)?.answers ?? props.content.answers ?? [],
)
const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.guesses?.some((g) => g?.trim())) n++
  return n
})
const hits = computed(() => scoreSurvey(board.value, props.inputs).hits)
</script>

<template>
  <div class="survey-host">
    <template v-if="!done">
      <div class="big-count">
        <span class="num mono">{{ count }}</span>
        <span class="lbl">answering</span>
      </div>
      <p class="hint">Name the most popular answers…</p>
    </template>
    <template v-else>
      <h3 class="reveal-title">Survey says…</h3>
      <ol class="board">
        <li v-for="(a, i) in board" :key="i" class="brow" :class="{ found: (hits[i] ?? 0) > 0 }">
          <span class="brank mono">{{ i + 1 }}</span>
          <span class="btext">{{ a.text }}</span>
          <span class="bhits">{{ hits[i] ?? 0 }} found</span>
          <span class="bpts mono">{{ a.points }}</span>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.survey-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-height: 220px;
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
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
.reveal-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 4vw, 34px);
}
.board {
  list-style: none;
  display: grid;
  gap: 8px;
  width: min(640px, 94%);
}
.brow {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 16px;
  opacity: 0.55;
}
.brow.found {
  opacity: 1;
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 12%, var(--surface-2));
}
.brank {
  font-weight: 800;
  color: var(--ink-soft);
}
.btext {
  font-weight: 800;
  font-size: clamp(16px, 2.4vw, 22px);
  overflow-wrap: anywhere;
}
.bhits {
  font-size: 13px;
  color: var(--mute);
  font-weight: 600;
}
.bpts {
  font-weight: 800;
  font-size: 22px;
  color: var(--c5);
}
</style>
