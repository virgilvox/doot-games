<script setup lang="ts">
/**
 * Big-screen view while players write their bars: a COUNT only, never the lines
 * (the verses are the surprise, performed by the robots in the vote round).
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import type { BarsContent, BarsInput } from './block'

const props = defineProps<{
  content: BarsContent
  inputs: Map<string, BarsInput>
  state: RoundState
  answer?: unknown
}>()

const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) {
    if (v?.lines && props.content.couplets.every((_, i) => v.lines[i]?.trim())) n++
  }
  return n
})
const done = computed(() => props.state === 'locked' || props.state === 'reveal')
</script>

<template>
  <div class="bars-host">
    <div class="big-count">
      <span class="num mono">{{ count }}</span>
      <span class="lbl">{{ done ? 'verses ready' : 'writing bars' }}</span>
    </div>
    <div v-if="!done" class="dots" aria-hidden="true"><span /><span /><span /></div>
    <p class="hint">{{ done ? 'Time for the robots to spit!' : 'Cooking up some heat…' }}</p>
  </div>
</template>

<style scoped>
.bars-host {
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
.dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.dots span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes pop {
  0%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
</style>
