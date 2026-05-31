<script setup lang="ts">
/** The host control footer: round progress dots, a state pill, a live "locked in"
 *  count so the host knows when to advance, and an actions slot. */
import { computed } from 'vue'

const props = defineProps<{
  roundIndex: number
  roundCount: number
  stateLabel: string
  /** Eligible players who have submitted this round (host shows "N / M in"). */
  lockedIn?: number
  /** Eligible players this round. When set and > 0, the count pill shows. */
  total?: number
}>()
const dots = computed(() =>
  Array.from({ length: props.roundCount }, (_, d) => ({
    done: d < props.roundIndex,
    current: d === props.roundIndex,
  })),
)
const showCount = computed(() => props.total != null && props.total > 0)
const allIn = computed(() => showCount.value && (props.lockedIn ?? 0) >= (props.total ?? 0))
</script>

<template>
  <div class="controlbar panel">
    <div class="progress">
      <span class="pnum mono">Round {{ roundIndex + 1 }} / {{ roundCount }}</span>
      <span class="dotbar">
        <i v-for="(d, i) in dots" :key="i" :class="{ done: d.done, cur: d.current }" />
      </span>
      <span class="state-pill mono">{{ stateLabel }}</span>
      <span v-if="showCount" class="lockpill" :class="{ allin: allIn }" aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" /><rect x="5" y="11" width="14" height="9" rx="2" /></svg>
        <span class="lcount"><b>{{ lockedIn ?? 0 }}</b> / {{ total }} {{ allIn ? 'in ✓' : 'locked in' }}</span>
      </span>
    </div>
    <div class="ctl-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.controlbar {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-radius: var(--radius-lg);
  padding: 14px 18px;
}
.progress {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.pnum {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.dotbar {
  display: flex;
  gap: 6px;
}
.dotbar i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--line-soft);
  border: 2px solid var(--line-soft);
}
.dotbar i.done {
  background: var(--primary);
  border-color: var(--primary);
}
.dotbar i.cur {
  background: var(--c1);
  border-color: var(--c1);
  transform: scale(1.25);
}
.state-pill {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 999px;
  border: 2px solid var(--line-soft);
  color: var(--ink-soft);
}
.lockpill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 999px;
  border: 2px solid var(--line-soft);
  background: var(--surface-2);
  color: var(--ink-soft);
  font-size: 14px;
  font-weight: 700;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.lockpill svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.lockpill .lcount b {
  color: var(--ink);
  font-size: 15px;
}
.lockpill.allin {
  background: color-mix(in srgb, var(--c5) 18%, var(--surface));
  border-color: var(--c5);
  color: color-mix(in srgb, var(--c5) 75%, var(--ink));
}
.lockpill.allin .lcount b {
  color: color-mix(in srgb, var(--c5) 80%, var(--ink));
}
.ctl-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
