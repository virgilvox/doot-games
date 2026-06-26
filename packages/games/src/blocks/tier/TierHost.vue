<script setup lang="ts">
/**
 * Big-screen Tier board. Renders the room's CONSENSUS board, not any one player's,
 * so it is a fixed size (tiers x items) no matter how many people are in the room.
 * The crowd shows up only as the "votes in" count and each item's agreement, which
 * is exactly why this view holds up in a packed room where a roster would not.
 *
 * While voting, items drift into their current modal tier as votes arrive (the
 * satisfying "consensus forming" moment), unless the author kept it hidden until the
 * reveal. Items nobody has placed wait in the tray.
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import type { TierContent, TierInput } from './block'
import { type TierPlacements, DEFAULT_TIERS, boardByTier, consensusBoard } from './logic'

const props = defineProps<{
  content: TierContent
  inputs?: Map<string, TierInput>
  state: RoundState
}>()

const voteList = computed<TierPlacements[]>(() => {
  const out: TierPlacements[] = []
  for (const i of props.inputs?.values() ?? []) if (i?.placements) out.push(i.placements)
  return out
})
const votesIn = computed(() => props.inputs?.size ?? 0)

// Show placements while the board forms live, or once revealed. When the author
// hid the consensus, everything waits in the tray until the reveal.
const revealed = computed(() => props.state === 'reveal' || props.content.liveConsensus)

const board = computed(() => consensusBoard(props.content.items, props.content.tiers.length, voteList.value))
const grouped = computed(() => boardByTier(board.value, props.content.tiers.length))
// When not revealed, force every item into the tray (hide the forming consensus).
const lanes = computed(() => (revealed.value ? grouped.value.lanes : props.content.tiers.map(() => [])))
const tray = computed(() => (revealed.value ? grouped.value.unplaced : board.value))

function colorOf(i: number): string {
  return props.content.tiers[i]?.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || 'var(--primary)'
}
function isDivisive(c: { controversy: number; total: number }): boolean {
  return props.state === 'reveal' && c.total >= 2 && c.controversy >= 0.5
}
</script>

<template>
  <div class="tier-host">
    <div class="th-board">
      <div v-for="(tier, ti) in content.tiers" :key="ti" class="th-lane" :style="{ '--tc': colorOf(ti) }">
        <div class="th-lane-label" :title="tier.label">{{ tier.label }}</div>
        <TransitionGroup name="th-pop" tag="div" class="th-lane-items">
          <div v-for="c in lanes[ti]" :key="c.id" class="th-cell" :class="{ divisive: isDivisive(c) }">
            <img v-if="c.image" :src="c.image" alt="" class="th-img" />
            <span class="th-cell-label">{{ c.label }}</span>
            <span v-if="state === 'reveal' && c.total" class="th-agree mono">{{ Math.round(c.agreement * 100) }}%</span>
            <div v-if="isDivisive(c)" class="th-split" aria-hidden="true">
              <span
                v-for="(v, vi) in c.votes"
                :key="vi"
                class="th-split-seg"
                :style="{ flex: v, background: colorOf(vi) }"
              />
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <div class="th-foot">
      <TransitionGroup name="th-pop" tag="div" class="th-tray">
        <div v-for="c in tray" :key="c.id" class="th-cell tray">
          <img v-if="c.image" :src="c.image" alt="" class="th-img" />
          <span class="th-cell-label">{{ c.label }}</span>
        </div>
      </TransitionGroup>
      <p class="th-count mono">{{ votesIn }} {{ votesIn === 1 ? 'board' : 'boards' }} in</p>
    </div>
  </div>
</template>

<style scoped>
.tier-host {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.th-board {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.th-lane {
  display: grid;
  grid-template-columns: clamp(48px, 6vw, 76px) 1fr;
  gap: 8px;
  align-items: stretch;
  background: color-mix(in srgb, var(--tc) 9%, var(--surface));
  border: var(--bd) solid color-mix(in srgb, var(--tc) 28%, var(--line-soft));
  border-radius: 12px;
  overflow: hidden;
  min-height: clamp(56px, 9vh, 96px);
}
.th-lane-label {
  display: grid;
  place-items: center;
  background: var(--tc);
  color: #1a1a1a;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 3vw, 34px);
  padding: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.th-lane-items,
.th-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: center;
  padding: 6px;
}
.th-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 9px;
  padding: 5px 9px 5px 5px;
  max-width: 100%;
}
.th-cell.tray {
  opacity: 0.85;
}
.th-cell.divisive {
  border-color: color-mix(in srgb, var(--c2, #e0507a) 60%, var(--line-soft));
}
.th-img {
  width: clamp(34px, 4vw, 52px);
  height: clamp(34px, 4vw, 52px);
  border-radius: 7px;
  object-fit: cover;
  flex: none;
}
.th-cell-label {
  font-weight: 700;
  font-size: clamp(13px, 1.5vw, 18px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: clamp(80px, 12vw, 180px);
}
.th-agree {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
}
.th-split {
  position: absolute;
  display: none;
}
/* The divisive split bar sits under the cell label, full cell width. */
.th-cell.divisive {
  position: relative;
  flex-wrap: wrap;
}
.th-cell.divisive .th-split {
  position: static;
  display: flex;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 2px;
}
.th-split-seg {
  min-width: 0;
}
.th-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.th-tray {
  padding: 4px 0;
  flex: 1;
  min-width: 0;
}
.th-count {
  flex: none;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 700;
}
.th-pop-enter-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.th-pop-enter-from {
  transform: scale(0.5);
  opacity: 0;
}
.th-pop-move {
  transition: transform 0.3s ease;
}
@media (prefers-reduced-motion: reduce) {
  .th-pop-enter-active,
  .th-pop-move {
    transition: none;
  }
}
</style>
