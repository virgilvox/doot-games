<script setup lang="ts">
/** Phone input for an Answer round: a single char-counted text field where the
 *  player types their answer. No options, no peeking at others. */
import { computed } from 'vue'
import type { AnswerContent, AnswerInput } from './block'

const props = defineProps<{ content: AnswerContent; modelValue: AnswerInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: AnswerInput] }>()

const MAX = 120
const remaining = computed(() => MAX - (props.modelValue.text?.length ?? 0))
function onInput(e: Event) {
  emit('update:modelValue', { text: (e.target as HTMLInputElement).value.slice(0, MAX) })
}
</script>

<template>
  <div class="answer">
    <input
      class="answer-input"
      type="text"
      :value="modelValue.text"
      :maxlength="MAX"
      :disabled="disabled"
      placeholder="Type your answer..."
      enterkeyhint="done"
      autocomplete="off"
      autocapitalize="off"
      aria-label="Your answer"
      @input="onInput"
    />
    <div class="counter mono" :class="{ low: remaining <= 10 }" aria-live="polite">{{ remaining }} left</div>
  </div>
</template>

<style scoped>
.answer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.answer-input {
  width: 100%;
  font: inherit;
  font-size: clamp(18px, 5vw, 24px);
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.answer-input:focus {
  outline: none;
  border-color: var(--primary);
}
.counter {
  align-self: flex-end;
  font-size: 13px;
  color: var(--mute);
  font-weight: 700;
}
.counter.low {
  color: var(--primary);
}
</style>
