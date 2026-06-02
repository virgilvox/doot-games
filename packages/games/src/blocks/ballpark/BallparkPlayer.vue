<script setup lang="ts">
/** Phone input for Ballpark: a single number. A numeric keypad on mobile. */
import { computed } from 'vue'
import type { BallparkContent, BallparkInput } from './block'

const props = defineProps<{ content: BallparkContent; modelValue: BallparkInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: BallparkInput] }>()

const shown = computed(() => (props.modelValue.value == null ? '' : String(props.modelValue.value)))
function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  const n = raw === '' ? null : Number(raw)
  emit('update:modelValue', { value: n != null && Number.isFinite(n) ? n : null })
}
</script>

<template>
  <div class="bp">
    <div class="field">
      <input
        class="bp-input mono"
        type="number"
        inputmode="decimal"
        :value="shown"
        :disabled="disabled"
        placeholder="0"
        aria-label="Your number"
        @input="onInput"
      />
      <span v-if="content.unit" class="unit">{{ content.unit }}</span>
    </div>
    <p class="hint">Closest guess wins. No need to be exact.</p>
  </div>
</template>

<style scoped>
.bp {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 10px 16px;
  box-shadow: var(--shadow-sm);
}
.field:focus-within {
  border-color: var(--primary);
}
.bp-input {
  flex: 1;
  width: 100%;
  font: inherit;
  font-size: clamp(28px, 9vw, 44px);
  font-weight: 800;
  color: var(--ink);
  background: transparent;
  border: none;
  outline: none;
}
.unit {
  font-weight: 800;
  font-size: 20px;
  color: var(--ink-soft);
}
.hint {
  color: var(--ink-soft);
  font-size: 14px;
  font-weight: 600;
}
</style>
