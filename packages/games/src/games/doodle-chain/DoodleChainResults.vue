<script setup lang="ts">
/**
 * The "unspool" results for Doodle Chain: every chain laid out step by step, the
 * written prompts as bubbles and the drawings as thumbnails, in the order they
 * travelled the room, attributed to who made each step. Reads the doodle block's
 * `recap` (passed through `StandardResults.recap` by `scoreGame`). Renders on the big
 * screen (full) and phones (compact); no leaderboard (the game is unscored).
 */
import { DrawThumb } from '@doot-games/ui'
import { computed } from 'vue'
import type { StandardResults } from '@doot-games/sdk'
import type { DoodleRecap } from '../../blocks/doodle/block'

const props = withDefaults(
  defineProps<{ results: StandardResults; me?: string | null; compact?: boolean; teams?: string[] }>(),
  { me: null, compact: false, teams: () => [] },
)

const recap = computed(() => (props.results?.recap as DoodleRecap | undefined) ?? { threads: [], aspect: 0.7 })
const threads = computed(() => recap.value.threads.filter((t) => t.some((s) => s.text || s.drawing)))
const aspect = computed(() => recap.value.aspect ?? 0.7)
const headline = computed(() => props.results?.headline ?? 'The chains are in')
</script>

<template>
  <div class="unspool" :class="{ compact }">
    <h2 class="headline">{{ headline }}</h2>
    <p v-if="!threads.length" class="empty">No chains were finished this round.</p>

    <ol class="threads">
      <li v-for="(thread, ti) in threads" :key="ti" class="chain">
        <div class="chain-head">Chain {{ ti + 1 }}</div>
        <ol class="steps">
          <li v-for="(s, si) in thread" :key="si" class="step" :class="{ self: me && s.name === me }">
            <span class="who">{{ s.name }}</span>
            <DrawThumb v-if="s.mode === 'draw' && s.drawing" :value="s.drawing" :aspect="aspect" :label="`${s.name}'s drawing`" />
            <span v-else class="text">{{ s.text || '...' }}</span>
          </li>
        </ol>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.unspool {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}
.headline {
  margin: 0;
  text-align: center;
  font-size: clamp(24px, 5vw, 44px);
  font-weight: 900;
  color: var(--ink);
}
.empty {
  text-align: center;
  color: var(--ink-soft);
}
.threads {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
.unspool:not(.compact) .threads {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.chain {
  border-radius: var(--radius);
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.chain-head {
  padding: 10px 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 13px;
  color: var(--surface);
  background: var(--primary);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.step {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.step.self .text {
  color: var(--primary);
}
.who {
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.text {
  font-size: clamp(15px, 2.2vw, 18px);
  font-weight: 600;
  line-height: 1.4;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.step :deep(.draw-thumb) {
  width: 100%;
  height: auto;
  border-radius: calc(var(--radius) - 4px);
  border: var(--bd) solid var(--line-soft);
  background: #fff;
}
</style>
