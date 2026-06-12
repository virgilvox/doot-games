<script setup lang="ts">
/**
 * A configurable face-button cluster. One `buttons` definition + a `layout`
 * discriminator render the classic arrangements: a 2-3 button `row`, a 4-button
 * `diamond` (placed by `pos`), the Genesis `six`, the N64 `abdiag` pair, and the
 * N64 `cbuttons` cross. Each child is a PadButton, so every button speaks the
 * logical-input contract; this component just lays them out and re-emits.
 */
import type { ClusterLayout, LayoutButton } from '../../controllers/layout'
import type { DigitalInputEvent } from '../../controllers/logical-input'
import PadButton from './PadButton.vue'

withDefaults(
  defineProps<{
    buttons: LayoutButton[]
    layout?: ClusterLayout
    disabled?: boolean
    haptic?: boolean
  }>(),
  { layout: 'row', disabled: false, haptic: true },
)
const emit = defineEmits<{ input: [DigitalInputEvent] }>()
const relay = (e: DigitalInputEvent) => emit('input', e)
</script>

<template>
  <!-- row: 2-3 round buttons in a line -->
  <div v-if="layout === 'row'" class="cluster row" role="group" aria-label="Action buttons">
    <PadButton
      v-for="b in buttons"
      :key="b.id"
      :id="b.id"
      :label="b.label"
      :hue="b.hue"
      :disabled="disabled"
      :haptic="haptic"
      @input="relay"
    />
  </div>

  <!-- diamond: four buttons placed N/S/E/W -->
  <div v-else-if="layout === 'diamond'" class="cluster diamond" role="group" aria-label="Action buttons">
    <PadButton
      v-for="b in buttons"
      :key="b.id"
      :id="b.id"
      :label="b.label"
      :hue="b.hue"
      :class="`pos-${b.pos ?? 'n'}`"
      :disabled="disabled"
      :haptic="haptic"
      @input="relay"
    />
  </div>

  <!-- six: two rows of three (Genesis) -->
  <div v-else-if="layout === 'six'" class="cluster six" role="group" aria-label="Action buttons">
    <div class="row6">
      <PadButton
        v-for="b in buttons.slice(0, 3)"
        :key="b.id"
        :id="b.id"
        :label="b.label"
        :hue="b.hue"
        :disabled="disabled"
        :haptic="haptic"
        @input="relay"
      />
    </div>
    <div class="row6">
      <PadButton
        v-for="b in buttons.slice(3)"
        :key="b.id"
        :id="b.id"
        :label="b.label"
        :hue="b.hue"
        :disabled="disabled"
        :haptic="haptic"
        @input="relay"
      />
    </div>
  </div>

  <!-- abdiag: a diagonal pair (B upper-left, A lower-right) -->
  <div v-else-if="layout === 'abdiag'" class="cluster abdiag" role="group" aria-label="Action buttons">
    <PadButton
      v-if="buttons[0]"
      :id="buttons[0].id"
      :label="buttons[0].label"
      :hue="buttons[0].hue"
      class="ab-b"
      :disabled="disabled"
      :haptic="haptic"
      @input="relay"
    />
    <PadButton
      v-if="buttons[1]"
      :id="buttons[1].id"
      :label="buttons[1].label"
      :hue="buttons[1].hue"
      class="ab-a"
      :disabled="disabled"
      :haptic="haptic"
      @input="relay"
    />
  </div>

  <!-- cbuttons: a spaced cross with a center C label (N64) -->
  <div v-else class="cluster cbuttons" role="group" aria-label="C buttons">
    <PadButton
      v-for="b in buttons"
      :key="b.id"
      :id="b.id"
      :label="b.label"
      :hue="b.hue"
      :class="`pos-${b.pos ?? 'n'}`"
      :disabled="disabled"
      :haptic="haptic"
      @input="relay"
    />
    <span class="clabel" aria-hidden="true">C</span>
  </div>
</template>

<style scoped>
.cluster {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* row */
.row {
  gap: clamp(10px, 2.8vmin, 18px);
}
.row :deep(.pad-btn) {
  width: calc(clamp(54px, 15vmin, 84px) * var(--control-scale, 1));
  height: calc(clamp(54px, 15vmin, 84px) * var(--control-scale, 1));
}

/* diamond: a 3x3 grid (mid-edge cells filled, corners + center empty), so the
   four buttons never overlap, unlike absolute positioning. */
.diamond {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(7px, 2vmin, 13px);
  width: calc(clamp(116px, 32vmin, 180px) * var(--control-scale, 1));
  height: calc(clamp(116px, 32vmin, 180px) * var(--control-scale, 1));
}
.diamond :deep(.pad-btn) {
  width: 100%;
  height: 100%;
}
.diamond .pos-n {
  grid-area: 1 / 2;
}
.diamond .pos-s {
  grid-area: 3 / 2;
}
.diamond .pos-w {
  grid-area: 2 / 1;
}
.diamond .pos-e {
  grid-area: 2 / 3;
}

/* six (Sega 6-button): two arced rows of round buttons fanning up to the right,
   the top row (X/Y/Z) staggered half a button right and above the bottom (A/B/C),
   echoing the real Mega Drive / Genesis 6-button pad. */
.six {
  --six-btn: calc(clamp(48px, 13.5vmin, 74px) * var(--control-scale, 1));
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--six-btn) * 0.06);
}
.row6 {
  display: flex;
  align-items: center;
  gap: calc(var(--six-btn) * 0.26);
}
/* the X/Y/Z row sits up and to the right of A/B/C */
.six > .row6:first-child {
  margin-left: calc(var(--six-btn) * 0.62);
}
/* arc: the left button of each row drops, the right one rises */
.row6 > :first-child {
  transform: translateY(16%);
}
.row6 > :last-child {
  transform: translateY(-16%);
}
.six :deep(.pad-btn) {
  width: var(--six-btn);
  height: var(--six-btn);
}

/* abdiag: button size is a fraction OF the container, so the diagonal offset
   stays proportional and the pair never collides at any viewport. */
.abdiag {
  position: relative;
  width: calc(clamp(128px, 33vmin, 184px) * var(--control-scale, 1));
  height: calc(clamp(102px, 26vmin, 148px) * var(--control-scale, 1));
  /* Sit slightly left of whatever is above it (the N64 C-diamond), matching the
     real pad where A/B are below-and-left of the C cluster. */
  align-self: flex-start;
  margin-left: -6%;
}
.abdiag :deep(.pad-btn) {
  position: absolute;
  width: 46%;
  height: 54%;
}
.abdiag .ab-b {
  left: 0;
  top: 0;
}
.abdiag .ab-a {
  right: 3%;
  bottom: 0;
}

/* cbuttons */
.cbuttons {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(7px, 2vmin, 13px);
  width: calc(clamp(126px, 33vmin, 182px) * var(--control-scale, 1));
  height: calc(clamp(126px, 33vmin, 182px) * var(--control-scale, 1));
}
.cbuttons :deep(.pad-btn) {
  width: 100%;
  height: 100%;
  font-size: clamp(10px, 2.6vmin, 13px);
}
.cbuttons .pos-n {
  grid-area: 1 / 2;
}
.cbuttons .pos-s {
  grid-area: 3 / 2;
}
.cbuttons .pos-w {
  grid-area: 2 / 1;
}
.cbuttons .pos-e {
  grid-area: 2 / 3;
}
.clabel {
  grid-area: 2 / 2;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--mute);
  font-size: clamp(13px, 3.4vmin, 18px);
}
</style>
