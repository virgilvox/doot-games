<script setup lang="ts">
/**
 * A compact, theme-aware toolbar for a drawing round: a row of color swatches, an
 * optional brush-size toggle, and undo/clear. Deliberately small so it sits over a
 * canvas without dominating it. Used by the Draw block and the Doodle chain draw
 * round. The picked color/size flow straight into `DrawCanvas` (each stroke stores
 * its own color, so a drawing can mix colors and `DrawThumb` renders them back).
 */
withDefaults(defineProps<{ color: string; size: number; canUndo?: boolean; showSizes?: boolean }>(), {
  canUndo: false,
  showSizes: true,
})
const emit = defineEmits<{
  'update:color': [c: string]
  'update:size': [n: number]
  undo: []
  clear: []
}>()

// A friendly, high-contrast drawing palette (not theme tokens: these are ink colors).
const COLORS = ['#1f2430', '#e5484d', '#f76808', '#ffb224', '#46a758', '#0091ff', '#8e4ec6', '#ffffff']
const SIZES = [
  { label: 'S', v: 0.006 },
  { label: 'M', v: 0.014 },
  { label: 'L', v: 0.028 },
]
</script>

<template>
  <div class="draw-toolbar">
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
        @click="emit('update:color', c)"
      />
    </div>
    <div v-if="showSizes" class="sizes" role="radiogroup" aria-label="Brush size">
      <button
        v-for="s in SIZES"
        :key="s.label"
        type="button"
        class="sizebtn"
        :class="{ on: size === s.v }"
        :aria-pressed="size === s.v"
        @click="emit('update:size', s.v)"
      >
        {{ s.label }}
      </button>
    </div>
    <div class="spacer" />
    <button type="button" class="toolbtn" :disabled="!canUndo" @click="emit('undo')">Undo</button>
    <button type="button" class="toolbtn" :disabled="!canUndo" @click="emit('clear')">Clear</button>
  </div>
</template>

<style scoped>
.draw-toolbar {
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
