<script setup lang="ts">
/**
 * Phone drawing input: a small toolbar (palette, brush size, undo, clear) over
 * the Pixi DrawCanvas. The generic renderer owns the "Lock it in" button and
 * gates it on `isComplete` (at least one stroke).
 */
import { DrawCanvas, DrawToolbar, type DrawValue } from '@doot-games/ui'
import { ref } from 'vue'
import type { DrawContent } from './block'

const props = defineProps<{ content: DrawContent; modelValue: DrawValue; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: DrawValue] }>()

const color = ref('#1f2430')
const size = ref(0.014)

function undo() {
  emit('update:modelValue', { strokes: props.modelValue.strokes.slice(0, -1) })
}
function clear() {
  emit('update:modelValue', { strokes: [] })
}
</script>

<template>
  <div class="draw-player">
    <DrawToolbar
      :color="color"
      :size="size"
      :can-undo="modelValue.strokes.length > 0"
      @update:color="color = $event"
      @update:size="size = $event"
      @undo="undo"
      @clear="clear"
    />
    <DrawCanvas
      :model-value="modelValue"
      :color="color"
      :size="size"
      :aspect="content.aspect"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.draw-player {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
