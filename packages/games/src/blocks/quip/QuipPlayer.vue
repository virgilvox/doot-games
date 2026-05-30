<script setup lang="ts">
/** Phone input for a Quip: a char-counted textarea. Controlled via v-model. */
import { computed } from 'vue'
import type { QuipContent, QuipInput } from './block'

const props = defineProps<{ content: QuipContent; modelValue: QuipInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: QuipInput] }>()

const remaining = computed(() => props.content.maxLength - (props.modelValue.text?.length ?? 0))
function onInput(e: Event) {
  const text = (e.target as HTMLTextAreaElement).value.slice(0, props.content.maxLength)
  emit('update:modelValue', { text })
}
</script>

<template>
  <div class="quip">
    <textarea
      class="quip-input"
      :value="modelValue.text"
      :maxlength="content.maxLength"
      :disabled="disabled"
      :placeholder="content.placeholder || 'Type your answer...'"
      rows="3"
      aria-label="Your answer"
      @input="onInput"
    />
    <div class="counter mono" :class="{ low: remaining <= 10 }" aria-live="polite">
      {{ remaining }} left
    </div>
  </div>
</template>

<style scoped>
.quip {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quip-input {
  width: 100%;
  resize: none;
  font: inherit;
  font-size: clamp(16px, 4.5vw, 20px);
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.quip-input:focus {
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
