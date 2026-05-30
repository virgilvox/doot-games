<script setup lang="ts">
/** Phone reveal for Split the Room: the most divisive scenario and its author. */
import { computed } from 'vue'
import type { SplitContent, SplitInput, SplitRevealSummary } from './block'

const props = defineProps<{
  content: SplitContent
  myInput?: SplitInput | null
  reveal?: SplitRevealSummary | null
}>()

const top = computed(() => props.reveal?.results?.[0] ?? null)
</script>

<template>
  <div class="split-reveal big">
    <div v-if="top" class="winner">
      <div class="kicker">Most divisive</div>
      <p class="wtext">&ldquo;{{ top.text }}&rdquo;</p>
      <p class="wsplit">split the room {{ top.yes }}&ndash;{{ top.no }}</p>
      <p class="wauthor">by {{ top.author }} &middot; {{ top.points }} pts</p>
    </div>
    <p v-else class="muted">Results are up. Check the big screen!</p>
  </div>
</template>

<style scoped>
.split-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}
.kicker {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 800;
}
.wtext {
  font-size: clamp(20px, 5.5vw, 28px);
  font-weight: 800;
  max-width: 26ch;
  overflow-wrap: anywhere;
}
.wsplit {
  font-weight: 700;
  color: var(--c5);
}
.wauthor {
  color: var(--c2);
  font-weight: 700;
}
.muted {
  color: var(--mute);
  font-weight: 600;
}
</style>
