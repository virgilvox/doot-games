<script setup lang="ts">
/**
 * Big-screen view while players fill their blanks. It never shows the words (the
 * finished stories are the surprise, revealed in the following vote round), so it
 * fills the stage with the SHAPE of the story instead: the blank labels as chips
 * (what kind of word each is) plus a live count, so the room has something to watch
 * while everyone writes.
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import type { FillContent, FillInput } from './block'

const props = defineProps<{
  content: FillContent
  inputs: Map<string, FillInput>
  state: RoundState
  answer?: unknown
}>()

const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) {
    if (v?.values && props.content.blanks.every((b) => v.values[b.id]?.trim())) n++
  }
  return n
})
const done = computed(() => props.state === 'locked' || props.state === 'reveal')
</script>

<template>
  <div class="fill-host">
    <div class="blanks" aria-hidden="true">
      <span v-for="b in content.blanks" :key="b.id" class="blank-chip">{{ b.label || b.id }}</span>
    </div>
    <div class="big-count">
      <span class="num mono">{{ count }}</span>
      <span class="lbl">{{ done ? 'stories ready' : 'stories so far' }}</span>
    </div>
    <div v-if="!done" class="dots" aria-hidden="true"><span /><span /><span /></div>
    <p class="hint">{{ done ? 'Time to read them out!' : 'Everyone is filling in the blanks...' }}</p>
  </div>
</template>

<style scoped>
.fill-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 3vh, 32px);
}
/* The story's shape: one chip per blank, so the screen shows what's being written
   without showing the words. Wraps and scales so a long template still fits. */
.blanks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  max-width: 760px;
}
.blank-chip {
  font-weight: 800;
  font-size: clamp(15px, 1.8vw, 22px);
  text-transform: lowercase;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 8px 18px;
  box-shadow: var(--shadow-sm);
}
.big-count {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  font-size: clamp(72px, 16vw, 160px);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: clamp(14px, 1.6vw, 18px);
}
.dots {
  display: flex;
  gap: 12px;
}
.dots span {
  width: 16px;
  height: 16px;
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
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
  font-size: clamp(15px, 1.8vw, 20px);
}
@media (prefers-reduced-motion: reduce) {
  .dots span {
    animation: none;
  }
}
</style>
