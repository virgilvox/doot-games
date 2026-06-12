<script setup lang="ts">
/**
 * Pick one from a short set: lane, stance, team, gear, weapon slot. A settings
 * widget (v-model). Rendered as an ARIA radio group so it is keyboard and
 * screen-reader operable.
 */
interface SegmentOption {
  value: string
  label: string
}
withDefaults(
  defineProps<{
    modelValue: string
    options: SegmentOption[]
    disabled?: boolean
    label?: string
  }>(),
  { disabled: false, label: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label || 'Choose one'">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === o.value"
      :class="{ on: modelValue === o.value }"
      :disabled="disabled"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  padding: 4px;
  gap: 4px;
}
.segmented button {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  border-radius: calc(var(--radius) - 5px);
  transition: background 0.16s, color 0.16s;
}
.segmented button.on {
  background: var(--primary);
  color: var(--primary-ink);
}
.segmented button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.segmented button:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .segmented button {
    transition: none;
  }
}
</style>
