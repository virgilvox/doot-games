<script setup lang="ts">
/**
 * The big tactile slam for buzz-in and lock-it-in moments. A momentary button
 * (press and release on the logical-input contract) sized large and round, with
 * a haptic tap on supporting devices.
 */
import type { DigitalInputEvent, LogicalButtonId } from '../../controllers/logical-input'
import { usePointerButton } from './usePointerButton'

const props = withDefaults(
  defineProps<{
    id?: LogicalButtonId
    label?: string
    disabled?: boolean
    haptic?: boolean
  }>(),
  { id: 'buzz', label: 'Buzz', disabled: false, haptic: true },
)
const emit = defineEmits<{ input: [DigitalInputEvent] }>()

const { pressed, handlers } = usePointerButton(
  (down) => emit('input', { id: props.id, pressed: down, source: 'touch' }),
  { haptic: props.haptic, disabled: () => props.disabled },
)
</script>

<template>
  <button
    type="button"
    class="buzzer"
    :class="{ pressed }"
    :disabled="disabled"
    :aria-pressed="pressed"
    :aria-label="label || id"
    v-on="handlers"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<style scoped>
.buzzer {
  width: calc(clamp(104px, 30vmin, 132px) * var(--control-scale, 1));
  height: calc(clamp(104px, 30vmin, 132px) * var(--control-scale, 1));
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--primary);
  color: var(--primary-ink);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(16px, 5vmin, 20px);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  user-select: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s, box-shadow 0.12s, filter 0.12s;
}
.buzzer.pressed {
  transform: translate(3px, 3px);
  box-shadow: none;
  filter: brightness(1.06);
}
.buzzer:disabled {
  opacity: 0.45;
  filter: saturate(0.6);
}
.buzzer:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .buzzer {
    transition: none;
  }
}
</style>
