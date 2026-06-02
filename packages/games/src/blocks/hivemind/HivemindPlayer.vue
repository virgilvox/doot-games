<script setup lang="ts">
/** Phone input for a Hivemind round: a short, char-counted text field. The goal
 *  is to match the crowd, so the hint nudges toward the obvious answer. */
import { computed } from 'vue'
import type { HivemindContent, HivemindInput } from './block'

const props = defineProps<{ content: HivemindContent; modelValue: HivemindInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: HivemindInput] }>()

const remaining = computed(() => props.content.maxLength - (props.modelValue.text?.length ?? 0))
function onInput(e: Event) {
  const text = (e.target as HTMLInputElement).value.slice(0, props.content.maxLength)
  emit('update:modelValue', { text })
}
</script>

<template>
  <div class="hive">
    <input
      class="hive-input"
      type="text"
      :value="modelValue.text"
      :maxlength="content.maxLength"
      :disabled="disabled"
      :placeholder="content.placeholder || 'Say what everyone is thinking...'"
      enterkeyhint="done"
      aria-label="Your answer"
      @input="onInput"
    />
    <div class="counter mono" :class="{ low: remaining <= 5 }" aria-live="polite">{{ remaining }} left</div>
  </div>
</template>

<style scoped>
.hive {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hive-input {
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
.hive-input:focus {
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
