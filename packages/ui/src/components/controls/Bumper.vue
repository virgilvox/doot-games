<script setup lang="ts">
/**
 * A shoulder trigger for the top edge of a landscape pad. Momentary (press and
 * release on the logical-input contract), with the flat-top / round-bottom pill
 * shape of a real bumper. `side` only adjusts the corner rounding.
 */
import { computed } from 'vue'
import type { DigitalInputEvent, LogicalButtonId } from '../../controllers/logical-input'
import { usePointerButton } from './usePointerButton'

const props = withDefaults(
  defineProps<{
    id: LogicalButtonId
    side?: 'left' | 'right'
    label?: string
    disabled?: boolean
    haptic?: boolean
  }>(),
  { side: 'left', label: '', disabled: false, haptic: true },
)
const emit = defineEmits<{ input: [DigitalInputEvent] }>()

const text = computed(() => props.label || (props.side === 'right' ? 'R' : 'L'))
const { pressed, handlers } = usePointerButton(
  (down) => emit('input', { id: props.id, pressed: down, source: 'touch' }),
  { haptic: props.haptic, disabled: () => props.disabled },
)
</script>

<template>
  <button
    type="button"
    class="bumper"
    :class="{ pressed }"
    :disabled="disabled"
    :aria-pressed="pressed"
    :aria-label="label || `${side} bumper`"
    v-on="handlers"
  >
    <slot>{{ text }}</slot>
  </button>
</template>

<style scoped>
.bumper {
  width: calc(clamp(62px, 15vmin, 104px) * var(--control-scale, 1));
  height: calc(clamp(34px, 7.6vmin, 52px) * var(--control-scale, 1));
  border-radius: 7px 7px 999px 999px;
  display: grid;
  place-items: center;
  background: var(--surface);
  color: var(--ink);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(11px, 2.6vmin, 14px);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  user-select: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.06s, box-shadow 0.06s, background 0.16s, color 0.16s;
}
.bumper.pressed {
  transform: translate(2px, 2px);
  box-shadow: none;
  background: var(--primary);
  color: var(--primary-ink);
}
.bumper:disabled {
  opacity: 0.45;
}
.bumper:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .bumper {
    transition: none;
  }
}
</style>
