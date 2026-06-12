<script setup lang="ts">
/**
 * A whole controller assembled from a {@link ControllerLayout}: shoulders across
 * the top, then a left column (d-pad + optional stick), a middle column (system
 * pills + a free slot for a stream embed), and a right column (face clusters +
 * optional right stick). Re-emits every child's logical-input event. This is the
 * convenience renderer; a game can also compose the primitives by hand.
 */
import { computed } from 'vue'
import type { ControllerLayout, LayoutButton } from '../../controllers/layout'
import type { AnalogInputEvent, DigitalInputEvent } from '../../controllers/logical-input'
import ActionCluster from './ActionCluster.vue'
import Bumper from './Bumper.vue'
import DPad from './DPad.vue'
import PadButton from './PadButton.vue'
import Thumbstick from './Thumbstick.vue'

const props = withDefaults(defineProps<{ layout: ControllerLayout; disabled?: boolean }>(), {
  disabled: false,
})
const emit = defineEmits<{ input: [DigitalInputEvent]; axis: [AnalogInputEvent] }>()
const onInput = (e: DigitalInputEvent) => emit('input', e)
const onAxis = (e: AnalogInputEvent) => emit('axis', e)

const dpad = computed(() => props.layout.clusters.find((c) => c.kind === 'dpad'))
const faces = computed(() => props.layout.clusters.filter((c) => c.kind === 'face'))
const system = computed(() => props.layout.clusters.find((c) => c.kind === 'system')?.buttons ?? [])
const shoulders = computed(
  () => props.layout.clusters.find((c) => c.kind === 'shoulders')?.buttons ?? [],
)

const side = (b: LayoutButton): 'left' | 'mid' | 'right' => {
  const id = b.id.toLowerCase()
  if (id.startsWith('l')) return 'left'
  if (id.startsWith('r')) return 'right'
  return 'mid'
}
const shouldersLeft = computed(() => shoulders.value.filter((b) => side(b) === 'left'))
const shouldersMid = computed(() => shoulders.value.filter((b) => side(b) === 'mid'))
const shouldersRight = computed(() => shoulders.value.filter((b) => side(b) === 'right'))
const dirIds = computed(() => {
  const b = dpad.value?.buttons ?? []
  const by = (k: string) => b.find((x) => x.id === k)?.id
  return {
    up: by('up') ?? 'up',
    down: by('down') ?? 'down',
    left: by('left') ?? 'left',
    right: by('right') ?? 'right',
  }
})
</script>

<template>
  <div class="pad">
    <div v-if="shoulders.length" class="shoulders">
      <div class="sh-grp">
        <Bumper
          v-for="b in shouldersLeft"
          :key="b.id"
          :id="b.id"
          :label="b.label"
          side="left"
          :disabled="disabled"
          @input="onInput"
        />
      </div>
      <div class="sh-grp">
        <Bumper
          v-for="b in shouldersMid"
          :key="b.id"
          :id="b.id"
          :label="b.label"
          side="left"
          :disabled="disabled"
          @input="onInput"
        />
      </div>
      <div class="sh-grp">
        <Bumper
          v-for="b in shouldersRight"
          :key="b.id"
          :id="b.id"
          :label="b.label"
          side="right"
          :disabled="disabled"
          @input="onInput"
        />
      </div>
    </div>

    <div class="body">
      <div class="zone left">
        <DPad v-if="dpad" :ids="dirIds" :disabled="disabled" @input="onInput" />
        <Thumbstick v-if="layout.hasStick" side="left" :disabled="disabled" @axis="onAxis" />
      </div>

      <div class="zone mid">
        <slot name="stream" />
        <div v-if="system.length" class="system">
          <PadButton
            v-for="b in system"
            :key="b.id"
            :id="b.id"
            :label="b.label"
            :hue="b.hue"
            shape="pill"
            :disabled="disabled"
            @input="onInput"
          />
        </div>
      </div>

      <div class="zone right">
        <ActionCluster
          v-for="(f, i) in faces"
          :key="i"
          :buttons="f.buttons"
          :layout="f.layout"
          :disabled="disabled"
          @input="onInput"
        />
        <Thumbstick v-if="layout.hasStickRight" side="right" :disabled="disabled" @axis="onAxis" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A real gamepad shape that FILLS its container (no transform tricks): shoulders
   pinned across the top, then a body that grows to fill the height with movement
   hugging the left, faces hugging the right, and the system column centered. The
   body is vertically centered so a short layout (NES) sits mid-screen instead of
   clinging to an edge. Controls self-size with `vmin` clamps, so the whole pad
   adapts to any phone without measuring anything. Mirrors the Doot emulator
   prototype's `#pad`. */
.pad {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 6px;
  user-select: none;
  touch-action: none;
  overflow: hidden;
}
.shoulders {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.sh-grp {
  display: flex;
  gap: clamp(8px, 2.4vmin, 16px);
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  /* Edge margin scales with width: keeps the thumb clusters off the very edge
     (natural for a held pad) and absorbs any cluster that overhangs its box, so
     a wide layout (N64 C-buttons) never clips against the screen edge. */
  padding: 4px clamp(10px, 2.6vw, 30px);
}
.zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4.4vmin, 28px);
}
.zone.mid {
  gap: 10px;
  max-width: min(52vw, 440px);
}
.system {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
</style>
