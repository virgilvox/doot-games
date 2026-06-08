<script setup lang="ts">
/** Phone input for a Survey round: a few text fields. Name the most popular answers
 *  to the prompt; each board answer you find scores its points. */
import { computed } from 'vue'
import type { SurveyContent, SurveyInput } from './logic'

const props = defineProps<{ content: SurveyContent; modelValue: SurveyInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: SurveyInput] }>()

const slots = computed(() => Array.from({ length: Math.max(1, props.content.guessCount || 3) }, (_, i) => i))
function set(i: number, e: Event) {
  const g = [...(props.modelValue.guesses ?? [])]
  while (g.length <= i) g.push('')
  g[i] = (e.target as HTMLInputElement).value.slice(0, 40)
  emit('update:modelValue', { guesses: g })
}
</script>

<template>
  <div class="survey">
    <p class="survey-hint">Name the most popular answers ({{ slots.length }} guesses).</p>
    <input
      v-for="i in slots"
      :key="i"
      class="survey-input"
      type="text"
      :value="modelValue.guesses?.[i] ?? ''"
      :disabled="disabled"
      maxlength="40"
      :placeholder="`Guess ${i + 1}`"
      autocomplete="off"
      autocapitalize="words"
      :aria-label="`Guess ${i + 1}`"
      @input="set(i, $event)"
    />
  </div>
</template>

<style scoped>
.survey {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.survey-hint {
  text-align: center;
  font-weight: 700;
  color: var(--ink-soft);
}
.survey-input {
  width: 100%;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.survey-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
