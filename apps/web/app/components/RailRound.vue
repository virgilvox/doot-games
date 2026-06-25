<script setup lang="ts">
/**
 * One round row in the editor's rounds rail: a drag handle, a select button (icon +
 * title + block kind + a one-line summary), and the move/remove controls. Draggable
 * (native DnD); the parent owns the reorder + section logic and just receives the
 * drag events. Rendered both loose and inside a section box, so it lives on its own
 * to keep the editor from growing.
 */
import { GameTypeIcon } from '@doot-games/ui'

defineProps<{
  block: string
  title: string
  kind: string
  summary: string
  accent: string
  index: number
  total: number
  selected: boolean
  error?: string
  dragging?: boolean
  dropAbove?: boolean
  dropBelow?: boolean
}>()
const emit = defineEmits<{
  select: []
  'move-up': []
  'move-down': []
  remove: []
  dragstart: [e: DragEvent]
  dragover: [e: DragEvent]
  drop: [e: DragEvent]
  dragend: []
}>()
</script>

<template>
  <div
    class="ed-rail-item"
    :class="{ on: selected, bad: error, dragging, 'drop-above': dropAbove, 'drop-below': dropBelow }"
    :style="{ '--round-accent': accent }"
    draggable="true"
    @dragstart="emit('dragstart', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragend')"
  >
    <span class="ed-drag-handle" aria-hidden="true" title="Drag to reorder, or into/out of a section">⠿</span>
    <button type="button" class="ed-chip" :aria-current="selected" @click="emit('select')">
      <GameTypeIcon :type="block" :size="28" />
      <span class="ed-chip-main">
        <span class="ed-chip-top">
          <span class="ed-chip-n">{{ title }}</span>
          <span class="ed-chip-kind">{{ kind }}</span>
        </span>
        <span class="ed-chip-sub">{{ summary }}</span>
      </span>
      <span v-if="error" class="ed-chip-dot" :title="error" aria-label="needs attention" />
    </button>
    <span class="ed-chip-controls">
      <button type="button" class="sf-icon-btn" :disabled="index === 0" aria-label="Move up" @click="emit('move-up')">↑</button>
      <button type="button" class="sf-icon-btn" :disabled="index === total - 1" aria-label="Move down" @click="emit('move-down')">↓</button>
      <button type="button" class="sf-icon-btn" aria-label="Remove round" @click="emit('remove')">✕</button>
    </span>
  </div>
</template>

<style scoped>
.ed-rail-item {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border: var(--bd) solid var(--line-soft);
  border-left: 4px solid var(--round-accent, var(--line-soft));
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
.ed-rail-item.on {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink) inset;
}
.ed-rail-item.bad {
  border-color: color-mix(in srgb, var(--primary) 55%, var(--line-soft));
  border-left-color: var(--primary);
}
.ed-rail-item.dragging {
  opacity: 0.4;
}
.ed-rail-item.drop-above {
  box-shadow: inset 0 3px 0 0 var(--primary);
}
.ed-rail-item.drop-below {
  box-shadow: inset 0 -3px 0 0 var(--primary);
}
.ed-drag-handle {
  flex: none;
  align-self: center;
  cursor: grab;
  color: var(--mute);
  font-size: 15px;
  line-height: 1;
  padding: 0 0 0 7px;
  user-select: none;
}
.ed-rail-item:active .ed-drag-handle {
  cursor: grabbing;
}
.ed-chip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 6px 10px 7px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--ink);
  font-family: inherit;
}
.ed-chip-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ed-chip-top {
  display: flex;
  align-items: center;
  gap: 7px;
}
.ed-chip-n {
  font-weight: 800;
  font-size: 13px;
}
.ed-chip-kind {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: color-mix(in srgb, var(--round-accent, var(--primary)) 22%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}
.ed-chip-sub {
  color: var(--ink-soft);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-chip-dot {
  width: 9px;
  height: 9px;
  flex: none;
  margin-right: 4px;
  border-radius: 50%;
  background: var(--primary);
}
.ed-chip-controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  border-left: var(--bd) solid var(--line-soft);
}
</style>
