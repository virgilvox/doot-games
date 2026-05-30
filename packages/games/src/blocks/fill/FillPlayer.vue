<script setup lang="ts">
/**
 * Phone input for a Mad Lib: a labelled box per blank. The story template is NOT
 * shown (the reveal is the joke); the player just supplies words by prompt.
 */
import { computed } from 'vue'
import type { FillContent, FillInput } from './block'

const props = defineProps<{ content: FillContent; modelValue: FillInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: FillInput] }>()

const values = computed(() => props.modelValue.values ?? {})
function onInput(id: string, e: Event) {
  const v = (e.target as HTMLInputElement).value.slice(0, props.content.maxLength)
  emit('update:modelValue', { values: { ...values.value, [id]: v } })
}
</script>

<template>
  <div class="fill">
    <label v-for="b in content.blanks" :key="b.id" class="fill-row">
      <span class="fill-label">{{ b.label || b.id }}</span>
      <input
        class="fill-input"
        type="text"
        :value="values[b.id] ?? ''"
        :maxlength="content.maxLength"
        :disabled="disabled"
        :aria-label="b.label || b.id"
        autocomplete="off"
        @input="onInput(b.id, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.fill {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fill-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.fill-label {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.fill-input {
  width: 100%;
  font: inherit;
  font-size: clamp(16px, 4.2vw, 19px);
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
}
.fill-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
