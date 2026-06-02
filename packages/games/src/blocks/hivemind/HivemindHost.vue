<script setup lang="ts">
/**
 * Big-screen Hivemind view. While players write it shows only a COUNT (showing the
 * answers would let people copy the leader and break the "say it at the same time"
 * tension). At reveal it stacks the emergent clusters, biggest first, so the room
 * sees how the hive mind converged.
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import { type HivemindContent, type HivemindInput, clusterAnswers } from './block'

const props = defineProps<{
  content: HivemindContent
  inputs: Map<string, HivemindInput>
  state: RoundState
  answer?: unknown
}>()

const done = computed(() => props.state === 'reveal')
const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.text?.trim()) n++
  return n
})
const clusters = computed(() => clusterAnswers(props.inputs))
const total = computed(() => clusters.value.reduce((n, c) => n + c.pids.length, 0) || 1)
</script>

<template>
  <div class="hive-host">
    <template v-if="!done">
      <div class="big-count">
        <span class="num mono">{{ count }}</span>
        <span class="lbl">{{ state === 'locked' ? 'answers locked in' : 'answers so far' }}</span>
      </div>
      <div v-if="state !== 'locked'" class="dots" aria-hidden="true"><span /><span /><span /></div>
      <p class="hint">{{ state === 'locked' ? 'Let’s see if you read the room…' : 'Think like everyone else…' }}</p>
    </template>
    <template v-else>
      <h3 class="reveal-title">The hive said…</h3>
      <ul class="clusters">
        <li v-for="(c, i) in clusters" :key="c.key" class="cluster" :class="{ top: i === 0 }">
          <span class="fill" :style="{ width: `${(c.pids.length / total) * 100}%` }" aria-hidden="true" />
          <span class="text">{{ c.label }}</span>
          <span class="cnt mono">{{ c.pids.length }}</span>
        </li>
      </ul>
      <p v-if="!clusters.length" class="hint">No answers this round.</p>
    </template>
  </div>
</template>

<style scoped>
.hive-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 220px;
}
.big-count {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  font-size: clamp(56px, 12vw, 120px);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 14px;
}
.dots {
  display: flex;
  gap: 10px;
}
.dots span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--c3);
  animation: pop 1.2s ease-in-out infinite;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pop {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}
.hint { color: var(--ink-soft); font-weight: 600; }
.reveal-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 4vw, 34px);
}
.clusters {
  list-style: none;
  display: grid;
  gap: 10px;
  width: min(620px, 92%);
}
.cluster {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  overflow: hidden;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.cluster.top {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface-2));
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-right: 2px solid var(--primary);
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 0;
}
.text, .cnt { position: relative; z-index: 1; }
.text { font-weight: 700; font-size: clamp(16px, 2.4vw, 22px); overflow-wrap: anywhere; }
.cnt { font-weight: 800; font-size: 22px; color: var(--ink-soft); }
</style>
