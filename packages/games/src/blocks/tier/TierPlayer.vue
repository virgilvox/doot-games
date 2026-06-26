<script setup lang="ts">
/**
 * Phone input for a Tier round: TAP to assign. Each item is a card with a row of
 * tier chips; tapping a chip places the item in that tier. No drag (Doot's
 * deliberate choice, like RankList's buttons): precise dragging of small thumbnails
 * on a touchscreen is the format's worst pain point, and taps are faster + fully
 * keyboard/screen-reader accessible.
 */
import { computed } from 'vue'
import type { TierContent, TierInput } from './block'
import { DEFAULT_TIERS, textOn } from './logic'

const props = defineProps<{ content: TierContent; modelValue: TierInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: TierInput] }>()

const placements = computed(() => props.modelValue?.placements ?? {})
const placedCount = computed(() => props.content.items.filter((it) => typeof placements.value[it.id] === 'number').length)

function colorOf(i: number): string {
  return props.content.tiers[i]?.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || 'var(--primary)'
}
function inkOf(i: number): string {
  return textOn(colorOf(i))
}
function place(itemId: string, tier: number) {
  if (props.disabled) return
  emit('update:modelValue', { placements: { ...placements.value, [itemId]: tier } })
}
</script>

<template>
  <div class="tier-player">
    <p class="tp-progress" aria-live="polite">
      <span class="tp-count mono">{{ placedCount }}/{{ content.items.length }}</span> placed
    </p>
    <ol class="tp-items">
      <li v-for="item in content.items" :key="item.id" class="tp-item" :class="{ done: typeof placements[item.id] === 'number' }">
        <div class="tp-head">
          <img v-if="item.image" :src="item.image" alt="" class="tp-thumb" />
          <span class="tp-label">{{ item.label }}</span>
        </div>
        <div class="tp-chips" role="group" :aria-label="`Tier for ${item.label}`">
          <button
            v-for="(tier, ti) in content.tiers"
            :key="ti"
            type="button"
            class="tp-chip"
            :class="{ on: placements[item.id] === ti }"
            :style="{ '--tc': colorOf(ti), '--tt': inkOf(ti) }"
            :aria-pressed="placements[item.id] === ti"
            :aria-label="`Place ${item.label} in tier ${tier.label}`"
            :disabled="disabled"
            @click="place(item.id, ti)"
          >
            {{ tier.label }}
          </button>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.tier-player {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tp-progress {
  text-align: center;
  color: var(--ink-soft);
  font-weight: 600;
  font-size: 14px;
}
.tp-count {
  font-weight: 800;
  color: var(--ink);
}
.tp-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tp-item {
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 14px;
  padding: 12px;
  transition: border-color 0.15s;
}
.tp-item.done {
  border-color: color-mix(in srgb, var(--primary) 35%, var(--line-soft));
}
.tp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.tp-thumb {
  width: 44px;
  height: 44px;
  border-radius: 9px;
  object-fit: cover;
  border: var(--bd) solid var(--line-soft);
  flex: none;
}
.tp-label {
  font-weight: 800;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.tp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.tp-chip {
  flex: 1 1 0;
  min-width: 44px;
  min-height: 44px;
  border-radius: 11px;
  border: 2px solid color-mix(in srgb, var(--tc) 45%, var(--line-soft));
  background: color-mix(in srgb, var(--tc) 8%, var(--surface-2));
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 17px;
  cursor: pointer;
  transition: transform 0.08s, background 0.12s, border-color 0.12s;
}
.tp-chip:active {
  transform: scale(0.94);
}
.tp-chip.on {
  background: var(--tc);
  border-color: var(--tc);
  color: var(--tt, #1a1a1a);
  box-shadow: var(--shadow-sm);
}
.tp-chip:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
