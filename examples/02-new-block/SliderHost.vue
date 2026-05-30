<script setup lang="ts">
/**
 * Big-screen view for the Slider block. Props are always
 * `{ content, inputs: Map<pid, Input>, state, answer }`. Here we show the live
 * count and running average; at reveal we emphasize the final average.
 *
 * (Opinion blocks have no `answer`. A block with a right answer would read the
 * `answer` prop, which the engine only provides at the reveal step.)
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import type { SliderContent, SliderInput } from './block'

const props = defineProps<{
  content: SliderContent
  inputs: Map<string, SliderInput>
  state: RoundState
  answer?: unknown
}>()

const stats = computed(() => {
  let sum = 0
  let n = 0
  for (const i of props.inputs.values()) {
    if (typeof i?.value === 'number') {
      sum += i.value
      n++
    }
  }
  return { avg: n ? Math.round(sum / n) : 0, n }
})
const revealed = computed(() => props.state === 'reveal')
</script>

<template>
  <div class="slider-host">
    <div class="avg" :class="{ big: revealed }">
      <span class="num mono">{{ stats.avg }}</span><span class="pct">%</span>
    </div>
    <div class="track"><span class="fill" :style="{ width: `${stats.avg}%` }" /></div>
    <div class="ends">
      <span>{{ content.lowLabel }}</span>
      <span>{{ content.highLabel }}</span>
    </div>
    <p class="count">{{ stats.n }} {{ stats.n === 1 ? 'response' : 'responses' }}</p>
  </div>
</template>

<style scoped>
.slider-host {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  justify-content: center;
}
.avg {
  text-align: center;
  font-weight: 800;
  color: var(--primary);
  transition: font-size 0.3s;
}
.num {
  font-size: clamp(48px, 9vw, 96px);
  line-height: 1;
}
.pct {
  font-size: 28px;
}
.track {
  height: 18px;
  border-radius: 999px;
  background: var(--surface);
  border: 2px solid var(--line-soft);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--primary);
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ends {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  color: var(--ink-soft);
}
.count {
  text-align: center;
  color: var(--ink-soft);
  font-weight: 600;
}
</style>
