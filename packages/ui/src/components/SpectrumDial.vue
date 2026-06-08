<script setup lang="ts">
/**
 * A CSS-first spectrum dial (0-100) between two labelled poles. Two modes:
 * - input (default): a draggable, accessible range the player sets.
 * - readonly: a static track that plots everyone's `marks` (dots), an optional
 *   `mean` line (the room's consensus), and the player's own `mine` mark.
 * Pure CSS + a native range input, so it is light, themeable, and accessible.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: number | null
    leftLabel: string
    rightLabel: string
    disabled?: boolean
    readonly?: boolean
    marks?: number[]
    mean?: number | null
    mine?: number | null
  }>(),
  { modelValue: null, disabled: false, readonly: false, marks: () => [], mean: null, mine: null },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const pos = computed(() => Math.max(0, Math.min(100, props.modelValue ?? 50)))
const clamp = (n: number | null | undefined) => Math.max(0, Math.min(100, n ?? 0))
function onInput(e: Event) {
  emit('update:modelValue', Math.round(Number((e.target as HTMLInputElement).value)))
}
</script>

<template>
  <div class="dial">
    <div class="poles">
      <span class="pole left">{{ leftLabel }}</span>
      <span class="pole right">{{ rightLabel }}</span>
    </div>

    <template v-if="!readonly">
      <input
        class="dial-range"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="pos"
        :disabled="disabled"
        :aria-label="`Place between ${leftLabel} and ${rightLabel}`"
        :aria-valuetext="modelValue == null ? 'not set, drag to place' : `${pos} of 100`"
        @input="onInput"
      />
      <p v-if="modelValue == null" class="dial-hint">Drag to place your guess</p>
    </template>

    <div v-else class="track" role="img" :aria-label="`Results between ${leftLabel} and ${rightLabel}`">
      <span
        v-for="(m, i) in marks"
        :key="i"
        class="mark"
        :style="{ left: `${clamp(m)}%` }"
        aria-hidden="true"
      />
      <span v-if="mine != null" class="mark mine" :style="{ left: `${clamp(mine)}%` }" aria-hidden="true" />
      <span v-if="mean != null" class="mean" :style="{ left: `${clamp(mean)}%` }" aria-hidden="true">
        <span class="mean-flag">consensus</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.dial {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.poles {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-weight: 800;
  font-size: 14px;
  color: var(--ink-soft);
}
.pole {
  max-width: 45%;
  overflow-wrap: anywhere;
}
.pole.right {
  text-align: right;
}
.dial-range {
  width: 100%;
  accent-color: var(--primary);
  height: 28px;
}
.dial-hint {
  text-align: center;
  font-size: 13px;
  color: var(--mute);
  font-weight: 600;
}
.track {
  position: relative;
  height: 44px;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--c1) 40%, var(--surface-2)), color-mix(in srgb, var(--c5) 40%, var(--surface-2)));
  border: var(--bd) solid var(--line-soft);
}
.mark {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ink);
  border: 2px solid var(--surface);
  transform: translate(-50%, -50%);
  transition: left 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.mark.mine {
  width: 18px;
  height: 18px;
  background: var(--primary);
  z-index: 2;
}
.mean {
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 3px;
  background: var(--c5);
  transform: translateX(-50%);
  z-index: 3;
}
.mean-flag {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c5);
  white-space: nowrap;
}
</style>
