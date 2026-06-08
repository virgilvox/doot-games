<script setup lang="ts">
/** Phone input for a Spectrum round: drag the dial to place the subject between the
 *  two poles. You score by landing near the room's consensus. */
import { SpectrumDial } from '@doot-games/ui'
import type { SpectrumContent, SpectrumInput } from './logic'

defineProps<{ content: SpectrumContent; modelValue: SpectrumInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: SpectrumInput] }>()
function set(value: number) {
  emit('update:modelValue', { value })
}
</script>

<template>
  <div class="spectrum">
    <SpectrumDial
      :model-value="modelValue.value"
      :left-label="content.leftLabel"
      :right-label="content.rightLabel"
      :disabled="disabled"
      @update:model-value="set"
    />
  </div>
</template>

<style scoped>
.spectrum {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 4px;
}
</style>
