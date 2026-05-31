<script setup lang="ts">
/**
 * A rounded-square type icon (ported from doot-mockup.html's `.ti`): a theme-
 * accent background with a white line icon chosen by game type / block kind.
 * Used on the create page typecards and the editor's round headers so each game
 * type / block is visually distinct at a glance.
 */
import { computed } from 'vue'
import { gameVisual } from '../visuals'

const props = withDefaults(defineProps<{ type: string; size?: number }>(), { size: 54 })
const visual = computed(() => gameVisual(props.type))
</script>

<template>
  <span class="ti" :style="{ width: `${size}px`, height: `${size}px`, background: visual.color }" aria-hidden="true">
    <svg viewBox="0 0 24 24" class="ti-svg">
      <template v-if="visual.icon === 'question'">
        <path d="M9 9a3 3 0 1 1 4 2.8c-1 .5-1 1-1 2.2" />
        <circle cx="12" cy="18" r="0.7" fill="currentColor" stroke="none" />
      </template>
      <path v-else-if="visual.icon === 'star'" d="M12 3l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 22l2.3-7.1-6-4.5h7.6z" />
      <path v-else-if="visual.icon === 'squiggle'" d="M4 16 Q8 6 12 13 T20 11" />
      <path v-else-if="visual.icon === 'bars'" d="M6 20V12M12 20V6M18 20v-5" />
      <path v-else-if="visual.icon === 'rank'" d="M4 6h16M4 12h11M4 18h6" />
      <template v-else-if="visual.icon === 'burst'">
        <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      </template>
      <path v-else-if="visual.icon === 'check'" d="M5 12l5 5L20 6" />
      <path v-else-if="visual.icon === 'text'" d="M5 7h14M5 12h14M5 17h8" />
      <template v-else-if="visual.icon === 'mic'">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
      </template>
      <template v-else-if="visual.icon === 'bell'">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </template>
      <template v-else>
        <rect x="4" y="4" width="7" height="7" rx="1.6" />
        <rect x="13" y="4" width="7" height="7" rx="1.6" />
        <rect x="4" y="13" width="7" height="7" rx="1.6" />
        <rect x="13" y="13" width="7" height="7" rx="1.6" />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.ti {
  display: grid;
  place-items: center;
  border-radius: 15px;
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
  flex: none;
}
.ti-svg {
  width: 56%;
  height: 56%;
  fill: none;
  stroke: #fff;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
