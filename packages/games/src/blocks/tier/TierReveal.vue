<script setup lang="ts">
/**
 * Phone reveal for a Tier round: the room's consensus tier for each item, with YOUR
 * pick called out when it differs, so the second screen pays off the big-screen
 * board ("you and the room agreed on 4 of 6").
 */
import { computed } from 'vue'
import type { TierContent, TierInput, TierRevealSummary } from './block'
import { DEFAULT_TIERS } from './logic'

const props = defineProps<{
  content: TierContent
  myInput?: TierInput | null
  reveal?: TierRevealSummary | null
}>()

const tiers = computed(() => props.reveal?.tiers ?? props.content.tiers)
const mine = computed(() => props.myInput?.placements ?? {})
const rows = computed(() =>
  (props.reveal?.board ?? [])
    .filter((b) => b.tier >= 0)
    .map((b) => {
      const my = mine.value[b.id]
      return { ...b, my: typeof my === 'number' ? my : null, agreed: my === b.tier }
    }),
)
const agreedCount = computed(() => rows.value.filter((r) => r.agreed).length)
function colorOf(i: number): string {
  return tiers.value[i]?.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || 'var(--primary)'
}
function labelOf(i: number): string {
  return tiers.value[i]?.label ?? '?'
}
</script>

<template>
  <div class="tier-reveal">
    <h2 class="tr-head">The room's board</h2>
    <p v-if="rows.length" class="tr-sub">
      You matched <strong>{{ agreedCount }}</strong> of {{ rows.length }}
    </p>
    <ul class="tr-rows">
      <li v-for="r in rows" :key="r.id" class="tr-row" :class="{ agreed: r.agreed }">
        <span class="tr-label">{{ r.label }}</span>
        <span class="tr-tier" :style="{ '--tc': colorOf(r.tier) }">{{ labelOf(r.tier) }}</span>
        <span v-if="r.my != null && !r.agreed" class="tr-mine">you said {{ labelOf(r.my) }}</span>
        <span v-else-if="r.agreed" class="tr-check" aria-label="you agreed">✓</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tier-reveal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tr-head {
  font-weight: 800;
  font-size: 20px;
}
.tr-sub {
  color: var(--ink-soft);
  font-weight: 600;
}
.tr-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tr-row {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  padding: 9px 12px;
}
.tr-row.agreed {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--line-soft));
}
.tr-label {
  flex: 1;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.tr-tier {
  flex: none;
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border-radius: 8px;
  background: var(--tc);
  color: #1a1a1a;
  font-family: var(--font-display);
  font-weight: 800;
}
.tr-mine {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--mute);
}
.tr-check {
  flex: none;
  color: var(--primary);
  font-weight: 800;
}
</style>
