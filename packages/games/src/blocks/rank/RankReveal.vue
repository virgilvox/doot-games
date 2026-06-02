<script setup lang="ts">
/**
 * Phone reveal for a Rank round: the room's consensus order, with the player's own
 * top pick called out (where did MY #1 land?). Second-screen payoff for a block
 * that otherwise only showed the chart on the big screen.
 */
import { computed } from 'vue'
import type { RankContent, RankInput, RankRevealSummary } from './block'

const props = defineProps<{
  content: RankContent
  myInput?: RankInput | null
  reveal?: RankRevealSummary | null
}>()

const order = computed(() => props.reveal?.order ?? [])
const myTopId = computed(() => props.myInput?.order?.[0] ?? null)
const myTopLabel = computed(
  () => props.content.items.find((i) => i.id === myTopId.value)?.label ?? '',
)
const myTopRoomRank = computed(() => {
  if (!myTopId.value) return 0
  const idx = order.value.findIndex((o) => o.id === myTopId.value)
  return idx >= 0 ? idx + 1 : 0
})
</script>

<template>
  <div class="rank-reveal big" aria-live="polite">
    <h2>The room's ranking</h2>
    <ol class="order">
      <li v-for="(o, i) in order" :key="o.id" class="item" :class="{ mine: o.id === myTopId }">
        <span class="rank mono">#{{ i + 1 }}</span>
        <span class="label">{{ o.label }}</span>
      </li>
    </ol>
    <p v-if="myTopRoomRank" class="note">
      Your top pick <b>{{ myTopLabel }}</b> is the room's <b>#{{ myTopRoomRank }}</b>.
    </p>
  </div>
</template>

<style scoped>
.rank-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}
.rank-reveal h2 { font-size: clamp(24px, 6vw, 34px); font-weight: 800; }
.order { list-style: none; display: grid; gap: 6px; width: min(420px, 92%); }
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 10px 14px;
  text-align: left;
}
.item.mine { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--surface-2)); }
.rank { font-weight: 800; color: var(--ink-soft); min-width: 2.2ch; }
.label { font-weight: 700; overflow-wrap: anywhere; }
.note { color: var(--ink-soft); max-width: 32ch; line-height: 1.45; }
.note b { color: var(--ink); }
</style>
