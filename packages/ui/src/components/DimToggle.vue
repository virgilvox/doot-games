<script setup lang="ts">
/**
 * Cycles the phone surface through brightness levels. Sits in the phone's top
 * bar; the dimming itself is an overlay owned by PhoneShell.
 */
import { computed } from 'vue'
import { DIM_LEVELS, dimLabel, nextDim } from '../dim'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const label = computed(() => dimLabel(props.modelValue))
const step = computed(() => DIM_LEVELS.indexOf(props.modelValue as never) + 1)
</script>

<template>
  <button
    type="button"
    class="dim-toggle"
    :aria-label="`Screen brightness: ${label}. Tap to dim.`"
    :title="`Brightness: ${label}`"
    @click="emit('update:modelValue', nextDim(props.modelValue))"
  >
    <!-- Colour is never the only signal: the pip count says the level too. -->
    <span class="dim-pips" aria-hidden="true">
      <i v-for="n in DIM_LEVELS.length" :key="n" :class="{ on: n <= step }" />
    </span>
    <span class="dim-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.dim-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius-sm, 8px);
  background: var(--surface-2);
  color: var(--ink-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.dim-toggle:focus-visible {
  outline: 2px solid var(--c1);
  outline-offset: 2px;
}
.dim-pips {
  display: inline-flex;
  gap: 2px;
}
.dim-pips i {
  width: 4px;
  height: 11px;
  border-radius: 1px;
  background: var(--line);
}
.dim-pips i.on {
  background: currentColor;
}
.dim-label {
  min-width: 6ch;
  text-align: left;
}
</style>
