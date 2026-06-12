<script setup lang="ts">
/**
 * A directional pad as one positional surface (not four buttons): a single
 * pointer's position within the cross decides which directions are active, so
 * diagonals and roll-overs feel like a real d-pad. Each direction whose state
 * changes emits the logical-input contract. Pointer capture keeps the hold while
 * the thumb drifts off; arrow keys drive it for keyboard / assistive tech.
 */
import { computed, reactive, watch } from 'vue'
import type { DigitalInputEvent, LogicalButtonId } from '../../controllers/logical-input'
import { dpadDirections } from '../../controllers/math'

type Dir = 'up' | 'down' | 'left' | 'right'

const props = withDefaults(
  defineProps<{
    ids?: Record<Dir, LogicalButtonId>
    threshold?: number
    diagonals?: boolean
    disabled?: boolean
    size?: number | null
  }>(),
  {
    ids: () => ({ up: 'up', down: 'down', left: 'left', right: 'right' }),
    threshold: 0.28,
    diagonals: true,
    disabled: false,
    size: null,
  },
)
const emit = defineEmits<{ input: [DigitalInputEvent] }>()

const active = reactive<Record<Dir, boolean>>({
  up: false,
  down: false,
  left: false,
  right: false,
})
const glyph: Record<Dir, string> = { up: '⌃', down: '⌄', left: '‹', right: '›' }
const sizeStyle = computed(() => (props.size != null ? { '--dpad-size': `${props.size}px` } : {}))
let pid: number | null = null

function setDir(dir: Dir, on: boolean) {
  if (active[dir] === on) return
  active[dir] = on
  emit('input', { id: props.ids[dir], pressed: on, source: 'touch' })
}
function applyAll(dirs: Record<Dir, boolean>) {
  setDir('up', dirs.up)
  setDir('down', dirs.down)
  setDir('left', dirs.left)
  setDir('right', dirs.right)
}
function evalPos(e: PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
  const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
  applyAll(dpadDirections(nx, ny, props.threshold, props.diagonals))
}
function onPointerdown(e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  pid = e.pointerId
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(pid)
  } catch {
    /* best effort */
  }
  evalPos(e)
}
function onPointermove(e: PointerEvent) {
  if (pid === e.pointerId) evalPos(e)
}
function release() {
  pid = null
  applyAll({ up: false, down: false, left: false, right: false })
}
// Release if capture is revoked (re-render mid-press) or the pad is disabled,
// so no direction is stranded "held".
watch(
  () => props.disabled,
  (d) => {
    if (d) release()
  },
)

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}
function onKeydown(e: KeyboardEvent) {
  const dir = KEY_DIR[e.key]
  if (!dir || props.disabled || e.repeat) return
  e.preventDefault()
  setDir(dir, true)
}
function onKeyup(e: KeyboardEvent) {
  const dir = KEY_DIR[e.key]
  if (!dir) return
  e.preventDefault()
  setDir(dir, false)
}
</script>

<template>
  <div
    class="dpad"
    :class="{ disabled }"
    :style="sizeStyle"
    role="group"
    aria-label="Directional pad, use the arrow keys"
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
    <span class="cell up" :class="{ on: active.up }" aria-hidden="true">{{ glyph.up }}</span>
    <span class="cell left" :class="{ on: active.left }" aria-hidden="true">{{ glyph.left }}</span>
    <span class="hub" aria-hidden="true" />
    <span class="cell right" :class="{ on: active.right }" aria-hidden="true">{{ glyph.right }}</span>
    <span class="cell down" :class="{ on: active.down }" aria-hidden="true">{{ glyph.down }}</span>
  </div>
</template>

<style scoped>
.dpad {
  --dr: calc(var(--radius) - 3px);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  width: calc(var(--dpad-size, clamp(104px, 28vmin, 158px)) * var(--control-scale, 1));
  height: calc(var(--dpad-size, clamp(104px, 28vmin, 158px)) * var(--control-scale, 1));
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.dpad:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 4px;
  border-radius: 12px;
}
.dpad.disabled {
  opacity: 0.45;
}
/* A connected cross (the design-system d-pad): each arm rounds only its OUTER
   corners, the inner edges stay square and face the centre hub, so the four arms
   read as one plus-shaped pad rather than four separate buttons. */
.cell {
  display: grid;
  place-items: center;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(18px, 5vmin, 26px);
  box-shadow: var(--shadow);
  transition: transform 0.06s, box-shadow 0.06s, background 0.16s, color 0.16s;
}
.up {
  grid-area: 1 / 2;
  border-radius: var(--dr) var(--dr) 0 0;
}
.left {
  grid-area: 2 / 1;
  border-radius: var(--dr) 0 0 var(--dr);
}
.right {
  grid-area: 2 / 3;
  border-radius: 0 var(--dr) var(--dr) 0;
}
.down {
  grid-area: 3 / 2;
  border-radius: 0 0 var(--dr) var(--dr);
}
.cell.on {
  background: var(--primary);
  color: var(--primary-ink);
  transform: translate(1px, 1px);
  box-shadow: none;
}
.hub {
  grid-area: 2 / 2;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: var(--bd) solid var(--line);
}
.hub::after {
  content: '';
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: var(--mute);
  opacity: 0.6;
}
@media (prefers-reduced-motion: reduce) {
  .cell {
    transition: none;
  }
}
</style>
