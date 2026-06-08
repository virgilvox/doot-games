<script setup lang="ts">
/**
 * The "unspool" results for Story Chain: every thread laid out line by line, in the
 * order it travelled the room, attributed to who wrote each line. Reads the chain
 * block's `recap` (passed through `StandardResults.recap` by `scoreGame`). Renders on
 * the big screen (full) and phones (compact); no leaderboard (the game is unscored).
 */
import { computed } from 'vue'
import type { StandardResults } from '@doot-games/sdk'
import type { ChainlineRecap } from '../../blocks/chainline/block'

const props = withDefaults(
  defineProps<{ results: StandardResults; me?: string | null; compact?: boolean; teams?: string[] }>(),
  { me: null, compact: false, teams: () => [] },
)

const recap = computed(() => (props.results?.recap as ChainlineRecap | undefined) ?? { threads: [] })
const threads = computed(() => recap.value.threads.filter((t) => t.some((s) => s.text.length > 0)))
const headline = computed(() => props.results?.headline ?? 'The stories are in')
</script>

<template>
  <div class="unspool" :class="{ compact }">
    <h2 class="headline">{{ headline }}</h2>
    <p v-if="!threads.length" class="empty">No stories were finished this round.</p>

    <ol class="threads">
      <li v-for="(thread, ti) in threads" :key="ti" class="story">
        <div class="story-head">Story {{ ti + 1 }}</div>
        <ol class="lines">
          <li v-for="(s, si) in thread" :key="si" class="line" :class="{ self: me && s.name === me }">
            <span class="who">{{ s.name }}</span>
            <span class="text">{{ s.text || '...' }}</span>
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}
.story {
  border-radius: var(--radius);
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.story-head {
  padding: 10px 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 13px;
  color: var(--surface);
  background: var(--primary);
}
.lines {
  list-style: none;
  margin: 0;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.line {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.line.self .text {
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
</style>
