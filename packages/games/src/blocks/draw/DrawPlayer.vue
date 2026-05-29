<script setup lang="ts">
/**
 * Phone drawing input: a small toolbar (palette, brush size, undo, clear) over
 * the Pixi DrawCanvas. The generic renderer owns the "Lock it in" button and
 * gates it on `isComplete` (at least one stroke).
 */
import { DrawCanvas, type DrawValue } from '@doot-games/ui'
import { ref } from 'vue'
import type { DrawContent } from './block'

const props = defineProps<{ content: DrawContent; modelValue: DrawValue; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: DrawValue] }>()

const COLORS = ['#1f2430', '#e5484d', '#f76808', '#ffb224', '#46a758', '#0091ff', '#8e4ec6', '#ffffff']
const SIZES = [
  { label: 'S', v: 0.006 },
  { label: 'M', v: 0.014 },
  { label: 'L', v: 0.028 },
]
const color = ref(COLORS[0]!)
const size = ref(SIZES[1]!.v)

function undo() {
  emit('update:modelValue', { strokes: props.modelValue.strokes.slice(0, -1) })
}
function clear() {
  emit('update:modelValue', { strokes: [] })
}
</script>

<template>
  <div class="draw-player">
    <div class="toolbar">
      <div class="swatches" role="radiogroup" aria-label="Brush color">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="swatch"
          :class="{ on: color === c }"
          :style="{ background: c }"
          :aria-label="`Color ${c}`"
          :aria-pressed="color === c"
          @click="color = c"
        />
      </div>
      <div class="sizes" role="radiogroup" aria-label="Brush size">
        <button
          v-for="s in SIZES"
          :key="s.label"
          type="button"
          class="sizebtn"
          :class="{ on: size === s.v }"
          :aria-pressed="size === s.v"
          @click="size = s.v"
        >
          {{ s.label }}
        </button>
      </div>
      <div class="spacer" />
      <button type="button" class="toolbtn" :disabled="!modelValue.strokes.length" @click="undo">Undo</button>
      <button type="button" class="toolbtn" :disabled="!modelValue.strokes.length" @click="clear">Clear</button>
    </div>
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.swatches {
  display: flex;
  gap: 5px;
}
.swatch {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid var(--line);
  cursor: pointer;
  padding: 0;
}
.swatch.on {
  outline: 3px solid var(--primary);
  outline-offset: 1px;
}
.sizes {
  display: flex;
  gap: 4px;
}
.sizebtn,
.toolbtn {
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  border-radius: 9px;
  padding: 6px 11px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.sizebtn.on {
  border-color: var(--primary);
  color: var(--primary);
}
.toolbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.spacer {
  flex: 1;
}
</style>
