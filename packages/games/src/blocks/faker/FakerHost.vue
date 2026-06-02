<script setup lang="ts">
/**
 * Big-screen view for a Faker make round. It shows ONLY the category and a count
 * of clues in, NEVER the secret word, because the faker is watching this screen
 * (the answer-withholding invariant, enforced in the view itself). The word lives
 * on each non-faker's private phone, not here.
 */
import type { RoundState } from '@doot-games/engine'
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { FakerContent, FakerInput } from './block'

const props = defineProps<{
  content: FakerContent
  inputs: Map<string, FakerInput>
  state: RoundState
  answer?: unknown
}>()

const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.clue?.trim()) n++
  return n
})
const done = computed(() => props.state === 'locked' || props.state === 'reveal')
</script>

<template>
  <div class="faker-host">
    <div class="kicker"><Icon name="mask" :size="18" /> One of you is the faker</div>
    <div class="category">{{ content.category }}</div>
    <div class="big-count">
      <span class="num mono">{{ count }}</span>
      <span class="lbl">{{ done ? 'clues locked in' : 'clues so far' }}</span>
    </div>
    <p class="hint">{{ done ? 'Now find the faker.' : 'Everyone is writing a one-word clue...' }}</p>
  </div>
</template>

<style scoped>
.faker-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 240px;
}
.kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary);
  font-size: 15px;
}
.category {
  font-size: clamp(36px, 8vw, 72px);
  font-weight: 900;
  color: var(--ink);
  text-align: center;
}
.big-count {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  font-size: clamp(44px, 9vw, 96px);
  font-weight: 800;
  line-height: 1;
  color: var(--c5);
}
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 14px;
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
</style>
