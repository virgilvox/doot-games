<script setup lang="ts">
/**
 * Phone reveal for a Rate round: your score vs the room's average, per category,
 * formatted on the round's own scale (numbers, grades, or tiers). Second-screen
 * feedback for a block that otherwise only paid off on the big screen.
 */
import { computed } from 'vue'
import { type RateContent, type RateInput, type RateRevealSummary, formatScore } from './block'

const props = defineProps<{
  content: RateContent
  myInput?: RateInput | null
  reveal?: RateRevealSummary | null
}>()

const rows = computed(() =>
  (props.reveal?.categories ?? []).map((c) => {
    const mine = props.myInput?.ratings?.[c.id]
    return {
      id: c.id,
      label: c.label,
      mine: typeof mine === 'number' ? formatScore(mine, props.content.scale) : null,
      room: c.count > 0 ? formatScore(c.avg, props.content.scale) : '—',
    }
  }),
)
const rated = computed(() => rows.value.some((r) => r.mine != null))
</script>

<template>
  <div class="rate-reveal big" aria-live="polite">
    <div class="badge" aria-hidden="true">&#11088;</div>
    <h2>{{ rated ? 'You vs the room' : 'The room rated it' }}</h2>
    <ul class="rows">
      <li v-for="r in rows" :key="r.id" class="row">
        <span class="cat">{{ r.label }}</span>
        <span class="vals">
          <span class="you"><small>you</small> {{ r.mine ?? '—' }}</span>
          <span class="room"><small>room</small> {{ r.room }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rate-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}
.badge {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.rate-reveal h2 { font-size: clamp(24px, 6vw, 34px); font-weight: 800; }
.rows { list-style: none; display: grid; gap: 8px; width: min(420px, 92%); }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 10px 14px;
}
.cat { font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; font-size: 13px; }
.vals { display: flex; gap: 14px; }
.you, .room { font-weight: 800; font-size: 20px; color: var(--ink); }
.room { color: var(--c2); }
.vals small { display: block; font-size: 10px; font-weight: 700; color: var(--mute); text-transform: uppercase; }
</style>
