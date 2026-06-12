<script setup lang="ts">
/**
 * A remap UI: walk every logical button a layout needs and bind it to whatever
 * physical gamepad button the player presses next. It drives a capture-mode
 * gamepad bridge (an identity mapping where each physical index reports itself),
 * so the same pure machinery that plays the game also records the remap. Emits
 * the updated {@link GamepadMapping} as bindings are captured.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  type GamepadBridge,
  type GamepadMapping,
  STANDARD_GAMEPAD_MAPPING,
  createGamepadBridge,
} from '../../controllers/gamepad'
import type { ControllerLayout } from '../../controllers/layout'
import DButton from '../DButton.vue'

const props = withDefaults(
  defineProps<{
    layout: ControllerLayout
    modelValue?: Partial<GamepadMapping>
    padIndex?: number | null
  }>(),
  { modelValue: () => ({}), padIndex: null },
)
const emit = defineEmits<{ 'update:modelValue': [GamepadMapping]; done: [] }>()

/** Every logical button this layout needs bound, with a friendly label. */
const acts = computed(() => {
  const out: { id: string; label: string }[] = []
  for (const cluster of props.layout.clusters) {
    for (const b of cluster.buttons) out.push({ id: b.id, label: b.label })
  }
  return out
})

const index = ref(0)
const result = ref<Record<number, string>>({})
const current = computed(() => acts.value[index.value] ?? null)
let bridge: GamepadBridge | null = null

/** Identity mapping: each physical index reports its own number as the id, so a
 *  press tells us exactly which physical button was hit. */
const captureMapping: GamepadMapping = {
  buttons: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, String(i)])),
  axes: {},
  deadzone: 0.5,
}

function emitMapping() {
  const buttons: Record<number, string> = {
    ...STANDARD_GAMEPAD_MAPPING.buttons,
    ...(props.modelValue.buttons ?? {}),
  }
  for (const [physical, logical] of Object.entries(result.value))
    buttons[Number(physical)] = logical
  emit('update:modelValue', {
    buttons,
    axes: props.modelValue.axes ?? STANDARD_GAMEPAD_MAPPING.axes,
    deadzone: props.modelValue.deadzone ?? STANDARD_GAMEPAD_MAPPING.deadzone,
  })
}

function bind(physicalIndex: number) {
  const act = current.value
  if (!act) return
  result.value = { ...result.value, [physicalIndex]: act.id }
  emitMapping()
  advance()
}
function advance() {
  if (index.value >= acts.value.length - 1) {
    finish()
    return
  }
  index.value += 1
}
function skip() {
  advance()
}
function reset() {
  result.value = {}
  index.value = 0
  emit('update:modelValue', { ...STANDARD_GAMEPAD_MAPPING })
}
function finish() {
  stop()
  emit('done')
}
function stop() {
  bridge?.stop()
  bridge = null
}

function start() {
  stop()
  index.value = 0
  result.value = {}
  bridge = createGamepadBridge({
    mapping: captureMapping,
    padIndex: props.padIndex,
    onInput: (e) => {
      if (e.pressed) bind(Number(e.id))
    },
    onAxis: () => {},
  })
  bridge.start()
}

// Start capturing as soon as a layout is present; restart if it changes.
watch(
  () => props.layout?.id,
  (id) => {
    if (id) start()
  },
  { immediate: true },
)
onUnmounted(stop)
</script>

<template>
  <div class="mapper" role="dialog" aria-label="Map your controller">
    <div class="title">Map your controller</div>
    <p class="prompt" aria-live="polite">
      <template v-if="current">Press your controller button for: <b>{{ current.label }}</b></template>
      <template v-else>All set.</template>
    </p>
    <div class="progress">{{ Math.min(index + 1, acts.length) }} / {{ acts.length }}</div>
    <div class="actions">
      <DButton variant="ghost" size="sm" @click="skip">Skip</DButton>
      <DButton variant="ghost" size="sm" @click="reset">Reset</DButton>
      <DButton variant="primary" size="sm" @click="finish">Done</DButton>
    </div>
  </div>
</template>

<style scoped>
.mapper {
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 22px;
  width: min(360px, 92vw);
  text-align: center;
}
.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  margin-bottom: 12px;
  color: var(--ink);
}
.prompt {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.progress {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--mute);
  margin: 6px 0 14px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
</style>
