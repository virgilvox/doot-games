<script setup lang="ts">
/** Final standings, winner emphasized. Reads the SDK's LeaderboardEntry shape. */
import { computed } from 'vue'
import Avatar from './Avatar.vue'

interface Entry {
  id?: string
  name: string
  score: number
  detail?: string
}
const props = withDefaults(defineProps<{ entries: Entry[]; highlight?: string | null; max?: number }>(), {
  highlight: null,
  max: 8,
})

// Competition ranking so a tie shares a place: co-leaders all get rank 1 (★) and
// the next entry is rank 3, not 2. Only crown (★) when the top score is above 0.
const ranked = computed(() =>
  props.entries
    .map((e) => ({
      ...e,
      rank: 1 + props.entries.filter((o) => o.score > e.score).length,
      leader: e.score > 0 && !props.entries.some((o) => o.score > e.score),
    }))
    .slice(0, props.max),
)
</script>

<template>
  <ol class="lb">
    <li
      v-for="e in ranked"
      :key="e.id ?? e.name"
      class="lb-row"
      :class="{ first: e.leader, me: highlight && e.name === highlight }"
    >
      <span class="rank">{{ e.leader ? '★' : e.rank }}</span>
      <Avatar :name="e.name" :id="e.id ?? e.name" :size="e.leader ? 44 : 32" class="av" />
      <span class="who">
        <span class="nm">{{ e.name }}</span>
        <span v-if="e.detail" class="dt">{{ e.detail }}</span>
      </span>
      <span class="sc mono">{{ e.score }}</span>
    </li>
  </ol>
</template>

<style scoped>
.lb {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 11px 14px;
}
/* The winner stands out: a brighter card, a gold star, a bigger avatar and name. */
.lb-row.first {
  border-color: var(--c1);
  background: color-mix(in srgb, var(--c1) 12%, var(--surface-2));
  box-shadow: var(--shadow-sm);
  padding: 14px;
  gap: 14px;
}
.lb-row.me {
  border-color: var(--primary);
}
.lb-row.first.me {
  border-color: var(--c1);
  box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--primary);
}
.rank {
  flex: none;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  width: 30px;
  text-align: center;
  color: var(--mute);
}
.lb-row.first .rank {
  color: var(--c1);
  font-size: 30px;
}
.av {
  flex: none;
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
/* Full names always show in full (wrapping onto a second line on a narrow phone)
   instead of being cut off with an ellipsis. */
.nm {
  font-weight: 800;
  font-size: 17px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.lb-row.first .nm {
  font-size: 20px;
}
.dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--mute);
}
.sc {
  flex: none;
  font-weight: 800;
  font-size: 20px;
  color: var(--c5);
}
.lb-row.first .sc {
  font-size: 26px;
}
</style>
