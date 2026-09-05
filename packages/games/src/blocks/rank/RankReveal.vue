<script setup lang="ts">
/**
 * Phone reveal for a Rank round: the room's consensus order with the winner on
 * top (its picture, when the item has one), the whole rest of the order below,
 * and the player's own top pick called out (where did MY #1 land?). Second-screen
 * payoff for a block that otherwise only showed the chart on the big screen.
 */
import { WinnerBoard } from '@doot-games/ui'
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
/** The place the room gave this player's own top pick, as the room counts places. */
const myTopRoomPlace = computed(() => {
  if (!myTopId.value) return ''
  const hit = order.value.find((o) => o.id === myTopId.value)
  if (!hit) return ''
  const i = order.value.indexOf(hit)
  return hit.place ?? `#${i + 1}`
})
/** No single winner when the top place is shared, so nothing crowns one of them. */
const tied = computed(() => props.reveal?.tied === true)
// The reveal carries each entry's picture, but fall back to the authored content
// for a room that revealed before this phone had the newer summary shape.
const imageFor = (id: string, fromReveal?: string) =>
  fromReveal || props.content.items.find((i) => i.id === id)?.image || ''
const board = computed(() =>
  order.value.map((o, i) => ({
    id: o.id,
    label: o.label,
    ...(imageFor(o.id, o.image) ? { image: imageFor(o.id, o.image) } : {}),
    // The place the ROOM gave it, published with the reveal. Numbering by row here
    // would read "#1, #2" for a dead heat the big screen shows as "#1, #1".
    place: o.place ?? `#${i + 1}`,
  })),
)
</script>

<template>
  <div class="rank-reveal big" aria-live="polite">
    <h2>The room's ranking</h2>
    <WinnerBoard class="rank-board" :entries="board" compact :highlight-id="myTopId" kicker="" :crown="!tied" />
    <p v-if="myTopRoomPlace" class="note">
      Your top pick <b>{{ myTopLabel }}</b> is the room's <b>{{ myTopRoomPlace }}</b>.
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
.rank-board { width: min(420px, 92%); text-align: left; }
.note { color: var(--ink-soft); max-width: 32ch; line-height: 1.45; }
.note b { color: var(--ink); }
</style>
