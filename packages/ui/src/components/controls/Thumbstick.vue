<script setup lang="ts">
/**
 * An analog thumbstick: drag the nub, get a normalized 2-axis sample on the
 * logical-input contract (`x` right-positive, `y` up-positive), with a dead-zone
 * clamp and auto-recenter on release. Emits are time-throttled so the relay is
 * not flooded; the final and the zeroed sample always go out. Arrow keys give a
 * keyboard equivalent.
 */
import { computed, ref, watch } from 'vue'
import type { AnalogInputEvent, AxisSide } from '../../controllers/logical-input'
import { clampStick, stickSample } from '../../controllers/math'

const props = withDefaults(
  defineProps<{
    side?: AxisSide
    deadzone?: number
    throttleMs?: number
    disabled?: boolean
    size?: number | null
  }>(),
  { side: 'left', deadzone: 0.1, throttleMs: 50, disabled: false, size: null },
)
const emit = defineEmits<{ axis: [AnalogInputEvent] }>()

const nub = ref({ x: 0, y: 0 }) // pointer-space offset (-1..1, +y down) for the visual
const dragging = ref(false)
const sizeStyle = computed(() => (props.size != null ? { '--stick-size': `${props.size}px` } : {}))
const valueText = computed(() => {
  const s = stickSample(nub.value.x, nub.value.y, props.deadzone)
  return `x ${s.x.toFixed(2)} y ${s.y.toFixed(2)}`
})
let pid: number | null = null
let last = 0

function send(clampedX: number, clampedY: number, force: boolean) {
  const s = stickSample(clampedX, clampedY, props.deadzone)
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (!force && now - last < props.throttleMs) return
  last = now
  emit('axis', { side: props.side, x: s.x, y: s.y, source: 'touch' })
}

function moveTo(e: PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const raw = clampStick(
    (e.clientX - (r.left + r.width / 2)) / (r.width / 2),
    (e.clientY - (r.top + r.height / 2)) / (r.height / 2),
  )
  nub.value = raw
  send(raw.x, raw.y, false)
}
function onPointerdown(e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  pid = e.pointerId
  dragging.value = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(pid)
  } catch {
    /* best effort */
  }
  moveTo(e)
}
function onPointermove(e: PointerEvent) {
  if (pid === e.pointerId) moveTo(e)
}
function release() {
  pid = null
  dragging.value = false
  nub.value = { x: 0, y: 0 }
  send(0, 0, true)
}
// Recenter if capture is revoked mid-drag or the stick is disabled.
watch(
  () => props.disabled,
  (d) => {
    if (d) release()
  },
)

// Keyboard: hold arrows to push the stick to full deflection on that axis.
const keyVec = { x: 0, y: 0 }
function keyApply() {
  const raw = clampStick(keyVec.x, keyVec.y)
  nub.value = raw
  send(raw.x, raw.y, true)
}
function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'ArrowLeft') keyVec.x = -1
  else if (e.key === 'ArrowRight') keyVec.x = 1
  else if (e.key === 'ArrowUp') keyVec.y = -1
  else if (e.key === 'ArrowDown') keyVec.y = 1
  else return
  e.preventDefault()
  keyApply()
}
function onKeyup(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keyVec.x = 0
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') keyVec.y = 0
  else return
  e.preventDefault()
  keyApply()
}
</script>

<template>
  <div
    class="stick"
    :class="{ disabled }"
    :style="sizeStyle"
    role="application"
    :aria-label="`Analog stick, use the arrow keys`"
    :aria-valuetext="valueText"
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
    <span
      class="nub"
      :class="{ dragging }"
      :style="{ transform: `translate(calc(-50% + ${nub.x * 50}%), calc(-50% + ${nub.y * 50}%))` }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.stick {
  position: relative;
  width: calc(var(--stick-size, clamp(100px, 27vmin, 152px)) * var(--control-scale, 1));
  height: calc(var(--stick-size, clamp(100px, 27vmin, 152px)) * var(--control-scale, 1));
  border-radius: 50%;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm), inset 0 0 0 6px color-mix(in srgb, var(--ink) 4%, transparent);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.stick:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 4px;
}
.stick.disabled {
  opacity: 0.45;
}
.nub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48%;
  height: 48%;
  border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--c2) 50%, var(--surface)), var(--c2));
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.nub.dragging {
  transition: none;
}
/* Stop the recenter spring under reduced motion (the nub still snaps to center,
   which conveys state; only the easing is dropped). */
@media (prefers-reduced-motion: reduce) {
  .nub {
    transition: none;
  }
}
</style>
