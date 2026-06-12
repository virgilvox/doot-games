<script setup lang="ts">
/**
 * An atomic momentary button: press and release emit the logical-input contract.
 * Tinted by a theme accent hue and shaped round / pill / square. The building
 * block of ActionCluster, and usable on its own. Size is driven by the
 * `--pad-btn-size` CSS var (the parent cluster sets it) or the `size` prop.
 */
import { computed } from 'vue'
import type { ClusterHue } from '../../controllers/layout'
import type { DigitalInputEvent, LogicalButtonId } from '../../controllers/logical-input'
import { usePointerButton } from './usePointerButton'

const props = withDefaults(
  defineProps<{
    id: LogicalButtonId
    label?: string
    hue?: ClusterHue
    shape?: 'round' | 'pill' | 'square'
    size?: number | null
    disabled?: boolean
    haptic?: boolean
    ariaLabel?: string
  }>(),
  {
    label: '',
    hue: 'none',
    shape: 'round',
    size: null,
    disabled: false,
    haptic: true,
    ariaLabel: '',
  },
)
const emit = defineEmits<{ input: [DigitalInputEvent] }>()

const { pressed, handlers } = usePointerButton(
  (down) => emit('input', { id: props.id, pressed: down, source: 'touch' }),
  { haptic: props.haptic, disabled: () => props.disabled },
)

const hued = computed(() => props.hue && props.hue !== 'none')
const sizeStyle = computed(() =>
  props.size != null ? { '--pad-btn-size': `${props.size}px` } : {},
)
</script>

<template>
  <button
    type="button"
    class="pad-btn"
    :class="[
      `shape-${shape}`,
      hued ? 'hued' : '',
      hue !== 'none' ? `hue-${hue}` : '',
      pressed ? 'pressed' : '',
    ]"
    :style="sizeStyle"
    :disabled="disabled"
    :aria-pressed="pressed"
    :aria-label="ariaLabel || label || id"
    v-on="handlers"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<style scoped>
.pad-btn {
  width: var(--pad-btn-size, 100%);
  height: var(--pad-btn-size, 100%);
  min-width: calc(44px * var(--control-scale, 1));
  min-height: calc(44px * var(--control-scale, 1));
  display: grid;
  place-items: center;
  background: var(--surface);
  color: var(--ink);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(15px, 4.2vmin, 21px);
  line-height: 1;
  user-select: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.06s, box-shadow 0.06s, background 0.16s, color 0.16s, filter 0.16s;
}
.shape-round {
  border-radius: 50%;
}
.shape-pill {
  border-radius: 999px;
  padding: calc(clamp(8px, 2vmin, 12px) * var(--control-scale, 1)) calc(clamp(14px, 4vmin, 22px) * var(--control-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: clamp(11px, 2.6vmin, 13px);
}
.shape-square {
  border-radius: calc(var(--radius) - 4px);
}
/* Accent hues: a solid candy fill. Bright/pastel accents read with a dark label
   on every theme (the prototype's per-hue ink, generalized). */
.hue-primary {
  background: var(--primary);
  color: var(--primary-ink);
}
.hue-c1 {
  background: var(--c1);
}
.hue-c2 {
  background: var(--c2);
}
.hue-c3 {
  background: var(--c3);
}
.hue-c4 {
  background: var(--c4);
}
.hue-c5 {
  background: var(--c5);
}
.hued:not(.hue-primary) {
  color: #241910;
  /* A bold dark rim on the colour, like the design-system face buttons. */
  border-color: color-mix(in srgb, var(--ink) 62%, transparent);
}
/* Pressed: sink in. A neutral button lights up to the primary accent; a hued
   one just darkens so its identity colour stays readable. */
.pad-btn.pressed {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.pad-btn:not(.hued).pressed {
  background: var(--primary);
  color: var(--primary-ink);
}
.hued.pressed {
  filter: brightness(0.9);
}
.pad-btn:disabled {
  opacity: 0.45;
  filter: saturate(0.6);
}
.pad-btn:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .pad-btn {
    transition: none;
  }
}
</style>
