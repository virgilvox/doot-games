<script setup lang="ts">
/**
 * Phone view for the Slider block. A controlled input: it renders `modelValue`
 * and emits `update:modelValue`. The generic renderer shows the prompt, image,
 * and the "Lock it in" button, so this is just the control itself.
 *
 * Props are always `{ content, modelValue, disabled }`; emit `update:modelValue`.
 */
import { computed } from 'vue'
import type { SliderContent, SliderInput } from './block'

const props = defineProps<{ content: SliderContent; modelValue: SliderInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: SliderInput] }>()

const value = computed(() => props.modelValue.value)
function onInput(e: Event) {
  emit('update:modelValue', { value: Number((e.target as HTMLInputElement).value) })
}
</script>

<template>
  <div class="slider">
    <div class="readout mono" aria-live="polite">{{ value }}</div>
    <input
      class="range"
      type="range"
      min="0"
      max="100"
      step="1"
      :value="value"
      :disabled="disabled"
      :aria-label="content.prompt"
      @input="onInput"
    />
    <div class="ends">
      <span>{{ content.lowLabel }}</span>
      <span>{{ content.highLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Use the theme tokens (--ink, --primary, --surface-2, ...) so the block matches
   whatever theme the host picked. */
.slider {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.readout {
  align-self: center;
  font-size: 40px;
  font-weight: 800;
  color: var(--primary);
}
.range {
  width: 100%;
  accent-color: var(--primary);
  height: 36px;
}
.ends {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  color: var(--ink-soft);
  font-size: 14px;
}
</style>
