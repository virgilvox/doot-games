<script setup lang="ts">
/** The host control footer: round progress dots, a state pill, and an actions slot. */
import { computed } from 'vue'

const props = defineProps<{ roundIndex: number; roundCount: number; stateLabel: string }>()
const dots = computed(() =>
  Array.from({ length: props.roundCount }, (_, d) => ({
    done: d < props.roundIndex,
    current: d === props.roundIndex,
  })),
)
</script>

<template>
  <div class="controlbar panel">
    <div class="progress">
      <span class="pnum mono">Round {{ roundIndex + 1 }} / {{ roundCount }}</span>
      <span class="dotbar">
        <i v-for="(d, i) in dots" :key="i" :class="{ done: d.done, cur: d.current }" />
      </span>
      <span class="state-pill mono">{{ stateLabel }}</span>
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
.ctl-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
