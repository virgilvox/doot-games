<script setup lang="ts">
/** Final standings, winner emphasized. Reads the SDK's LeaderboardEntry shape. */
import Avatar from './Avatar.vue'

interface Entry {
  id?: string
  name: string
  score: number
  detail?: string
}
withDefaults(defineProps<{ entries: Entry[]; highlight?: string | null; max?: number }>(), {
  highlight: null,
  max: 8,
})
</script>

<template>
  <ol class="lb">
    <li
      v-for="(e, i) in entries.slice(0, max)"
      :key="e.id ?? e.name"
      class="lb-row"
      :class="{ first: i === 0, me: highlight && e.name === highlight }"
    >
      <span class="rank">{{ i === 0 ? '★' : i + 1 }}</span>
      <span class="who">
        <Avatar :name="e.name" :id="e.id ?? e.name" :size="30" />
        <span class="nm">{{ e.name }}</span>
      </span>
      <span class="sc mono">
        {{ e.score }}<small v-if="e.detail"> · {{ e.detail }}</small>
      </span>
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
  gap: 13px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 11px 14px;
}
.lb-row.first {
  border-color: var(--c1);
  box-shadow: var(--shadow-sm);
}
.lb-row.me {
  border-color: var(--primary);
}
.rank {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 24px;
  width: 36px;
  text-align: center;
  color: var(--mute);
}
.lb-row.first .rank {
  color: var(--c1);
}
.who {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.nm {
  font-weight: 800;
  font-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc {
  font-weight: 700;
  font-size: 18px;
  color: var(--c5);
}
.sc small {
  color: var(--mute);
  font-weight: 400;
  font-size: 12px;
}
</style>
