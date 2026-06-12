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
      <div class="col">
        <DPad v-if="dpad" :ids="dirIds" :disabled="disabled" @input="onInput" />
        <Thumbstick v-if="layout.hasStick" side="left" :disabled="disabled" @axis="onAxis" />
      </div>

      <div class="col mid">
        <slot name="stream" />
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

      <div class="col">
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
.pad {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  min-height: 0;
  user-select: none;
  touch-action: none;
}
.shoulders {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
}
.sh-grp {
  display: flex;
  gap: clamp(8px, 2.4vmin, 16px);
}
.body {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 0;
  padding: 4px 2px;
}
.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4.4vmin, 28px);
}
.col.mid {
  gap: 10px;
}
</style>
