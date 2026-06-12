<script setup lang="ts">
/**
 * A continuous or stepped slider for confidence, aim, bid, wager, or a throttle.
 * Horizontal and vertical orientations. A settings widget (v-model), not part of
 * the logical-input contract: a gamepad has no slider. Horizontal wraps a native
 * range (keyboard + ARIA for free); vertical uses pointer math with a mirrored
 * hidden range so it stays operable by keyboard and assistive tech.
 */
import { computed, ref } from 'vue'
import { sliderPct, sliderValueFromPointer } from '../../controllers/math'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number | null
    orientation?: 'horizontal' | 'vertical'
    label?: string
    showValue?: boolean
    disabled?: boolean
  }>(),
  {
    min: 0,
    max: 100,
    step: null,
    orientation: 'horizontal',
    label: '',
    showValue: true,
    disabled: false,
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const frac = computed(() => sliderPct(props.modelValue, props.min, props.max))
const stepAttr = computed(() => (props.step != null ? props.step : 'any'))
const ticks = computed(() => {
  if (props.step == null || props.step <= 0) return 0
  return Math.floor((props.max - props.min) / props.step) + 1
})
const track = ref<HTMLElement | null>(null)
let pid: number | null = null

function onRange(e: Event) {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}
function setFromPointer(e: PointerEvent) {
  const el = track.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const value = sliderValueFromPointer({
    clientPos: e.clientY,
    trackStart: r.top,
    trackLength: r.height,
    min: props.min,
    max: props.max,
    step: props.step,
    axis: 'y',
  })
  emit('update:modelValue', value)
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
  setFromPointer(e)
}
function onPointermove(e: PointerEvent) {
  if (pid === e.pointerId) setFromPointer(e)
}
function release() {
  pid = null
}
</script>

<template>
  <!-- horizontal: native range + painted track -->
  <div v-if="orientation === 'horizontal'" class="slider h" :style="{ '--pct': frac }">
    <div class="track">
      <span class="fill" />
      <span v-if="ticks" class="ticks">
        <i v-for="n in ticks" :key="n" />
      </span>
      <span class="thumb" />
      <input
        type="range"
        :min="min"
        :max="max"
        :step="stepAttr"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label || 'Slider'"
        @input="onRange"
      />
    </div>
    <div v-if="label || showValue" class="meta">
      <span>{{ label }}</span>
      <span v-if="showValue" class="val">{{ modelValue }}</span>
    </div>
  </div>

  <!-- vertical: pointer-driven track with a mirrored hidden range for AT -->
  <div v-else class="slider v" :class="{ disabled }" :style="{ '--pct': frac }">
    <div
      ref="track"
      class="vtrack"
      @pointerdown="onPointerdown"
      @pointermove="onPointermove"
      @pointerup="release"
      @pointercancel="release"
      @lostpointercapture="release"
    >
      <span class="vfill" />
      <span class="vknob" />
    </div>
    <input
      class="sr-only"
      type="range"
      :min="min"
      :max="max"
      :step="stepAttr"
      :value="modelValue"
      :disabled="disabled"
      aria-orientation="vertical"
      :aria-label="label || 'Slider'"
      @input="onRange"
    />
    <div v-if="showValue" class="vval">{{ modelValue }}</div>
  </div>
</template>

<style scoped>
.slider.h {
  width: 100%;
}
.track {
  position: relative;
  height: 44px;
}
.track input[type='range'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.fill,
.ticks,
.thumb {
  pointer-events: none;
}
.track::before {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  height: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
}
.fill {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  height: 12px;
  /* Inset-correct: the rail spans [14px, 100%-14px], so the fill width tracks
     the value within that interior, aligning with the thumb at every point. */
  width: calc((100% - 28px) * var(--pct, 0));
  background: var(--primary);
  border-radius: 999px;
}
.ticks {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  height: 12px;
  display: flex;
  justify-content: space-between;
}
.ticks i {
  width: 2px;
  height: 12px;
  background: var(--line);
  opacity: 0.5;
}
.thumb {
  position: absolute;
  top: 50%;
  /* Center sits in the same inset interior as the fill end. */
  left: calc(14px + (100% - 28px) * var(--pct, 0));
  width: 26px;
  height: 26px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.meta {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute);
  margin-top: 2px;
}
.val {
  color: var(--ink-soft);
}

/* vertical */
.slider.v {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.vtrack {
  position: relative;
  width: 62px;
  height: clamp(120px, 30vmin, 180px);
  touch-action: none;
  cursor: pointer;
}
.vtrack::before {
  content: '';
  position: absolute;
  inset: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 18px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
}
.vfill {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 18px;
  height: calc(var(--pct, 0) * 100%);
  background: var(--c4);
  border-radius: 999px;
}
.vknob {
  position: absolute;
  left: 50%;
  /* Center travels the interior [15px, height-15px] so the 30px knob never
     overshoots either end. pct=1 is the top. */
  top: calc(15px + (1 - var(--pct, 0)) * (100% - 30px));
  width: 46px;
  height: 30px;
  transform: translate(-50%, -50%);
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: calc(var(--radius) - 6px);
  box-shadow: var(--shadow-sm);
}
.vval {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
}
.slider.v.disabled {
  opacity: 0.45;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
/* The range input is the last child, so a sibling selector can't reach the
   thumb; light the thumb when the track holds focus instead. */
.track:focus-within .thumb {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
.sr-only:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
</style>
