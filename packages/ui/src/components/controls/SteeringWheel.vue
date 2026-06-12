<script setup lang="ts">
/**
 * A steering wheel: drag left/right (or tilt the device, wired by the consumer) to
 * steer. Reports a single normalized axis on the logical-input contract as an
 * `axis` event (`side='left'`, `x` = steer -1..1 left..right, `y` = 0), so it plugs
 * into the same input pipeline as Thumbstick. The wheel rotates with the steer
 * value and springs back to centre on release. Arrow keys give a keyboard
 * equivalent. Design-system look: thick dark rim, hard offset shadow, accent grip.
 */
import { computed, ref, watch } from 'vue'
import type { AnalogInputEvent } from '../../controllers/logical-input'

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

const props = withDefaults(
  defineProps<{
    /** Drag distance (px) for full lock. */
    range?: number
    /** Max visual wheel rotation (deg) at full lock. */
    maxAngle?: number
    throttleMs?: number
    disabled?: boolean
    size?: number | null
  }>(),
  { range: 120, maxAngle: 120, throttleMs: 40, disabled: false, size: null },
)
const emit = defineEmits<{ axis: [AnalogInputEvent]; steer: [number] }>()

const steer = ref(0)
const dragging = ref(false)
const sizeStyle = computed(() => (props.size != null ? { '--wheel-size': `${props.size}px` } : {}))
let pid: number | null = null
let startX = 0
let last = 0

function send(value: number, force: boolean) {
  const v = clamp(value, -1, 1)
  steer.value = v
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (!force && now - last < props.throttleMs) return
  last = now
  emit('axis', { side: 'left', x: v, y: 0, source: 'touch' })
  emit('steer', v)
}

function onPointerdown(e: PointerEvent) {
  if (props.disabled || pid !== null) return
  e.preventDefault()
  pid = e.pointerId
  startX = e.clientX
  dragging.value = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(pid)
  } catch {
    /* best effort */
  }
}
function onPointermove(e: PointerEvent) {
  if (pid !== e.pointerId) return
  send((e.clientX - startX) / props.range, false)
}
function release() {
  if (pid === null && steer.value === 0) return
  pid = null
  dragging.value = false
  send(0, true)
}
watch(
  () => props.disabled,
  (d) => {
    if (d) release()
  },
)

let keyDir = 0
function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'ArrowLeft') keyDir = -1
  else if (e.key === 'ArrowRight') keyDir = 1
  else return
  e.preventDefault()
  send(keyDir, true)
}
function onKeyup(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    keyDir = 0
    e.preventDefault()
    send(0, true)
  }
}
</script>

<template>
  <div
    class="wheel"
    :class="{ disabled, dragging }"
    :style="sizeStyle"
    role="application"
    aria-label="Steering wheel, drag left or right; arrow keys also steer"
    :aria-valuetext="`steer ${steer.toFixed(2)}`"
    :tabindex="disabled ? -1 : 0"
    @pointerdown="onPointerdown"
    @pointermove="onPointermove"
    @pointerup="release"
    @pointercancel="release"
    @lostpointercapture="release"
    @contextmenu.prevent
    @keydown="onKeydown"
    @keyup="onKeyup"
  >
    <svg
      class="rim"
      viewBox="0 0 120 120"
      :style="{ transform: `rotate(${steer * maxAngle}deg)` }"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="16" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="9" />
      <path d="M60 14 v22 M60 84 v22 M14 60 h22 M84 60 h22" stroke="var(--line)" stroke-width="10" />
      <path d="M60 16 v18" stroke="var(--primary)" stroke-width="6" />
      <circle cx="60" cy="60" r="14" fill="var(--surface)" stroke="var(--line)" stroke-width="4" />
      <circle cx="60" cy="60" r="4" fill="var(--primary)" />
    </svg>
  </div>
</template>

<style scoped>
.wheel {
  position: relative;
  width: calc(var(--wheel-size, clamp(150px, 42vmin, 280px)) * var(--control-scale, 1));
  height: calc(var(--wheel-size, clamp(150px, 42vmin, 280px)) * var(--control-scale, 1));
  display: grid;
  place-items: center;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.rim {
  width: 100%;
  height: 100%;
  filter: drop-shadow(var(--shadow));
  transition: transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.wheel.dragging .rim {
  transition: none;
}
.wheel:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 4px;
  border-radius: 50%;
}
.wheel.disabled {
  opacity: 0.45;
}
@media (prefers-reduced-motion: reduce) {
  .rim {
    transition: none;
  }
}
</style>
