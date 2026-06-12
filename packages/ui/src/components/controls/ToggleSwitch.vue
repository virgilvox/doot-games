<script setup lang="ts">
/**
 * A sticky on/off switch for lights, mute, auto-fire, or any persistent
 * preference. A settings widget (v-model) wrapping a native checkbox with
 * `role="switch"`, so Space toggles it and assistive tech announces the state.
 */
withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    disabled?: boolean
  }>(),
  { label: '', disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="toggle" :class="{ disabled }">
    <input
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="label || 'Toggle'"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="track"><span class="knob" /></span>
    <span v-if="label" class="text">{{ label }}</span>
  </label>
</template>

<style scoped>
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.toggle input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.track {
  width: 60px;
  height: 34px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  position: relative;
  flex-shrink: 0;
  transition: background 0.18s;
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.toggle input:checked + .track {
  background: var(--primary);
}
.toggle input:checked + .track .knob {
  transform: translateX(25px);
}
.toggle input:focus-visible + .track {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .track,
  .knob {
    transition: none;
  }
}
</style>
