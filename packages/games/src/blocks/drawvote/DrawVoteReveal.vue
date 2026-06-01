<script setup lang="ts">
/**
 * Phone reveal: which drawing won (shown on your screen, not just the big one),
 * and whether you voted for it.
 */
import { DrawThumb } from '@doot-games/ui'
import { computed } from 'vue'
import type { DrawVoteContent, DrawVoteInput, DrawVoteRevealSummary } from './block'

const props = defineProps<{
  content: DrawVoteContent
  myInput?: DrawVoteInput | null
  reveal?: DrawVoteRevealSummary | null
}>()

const winner = computed(() => props.reveal?.tallies?.[0] ?? null)
const votedWinner = computed(() => !!winner.value && props.myInput?.choice === winner.value.id)
</script>

<template>
  <div class="dv-reveal big">
    <div v-if="winner" class="winner">
      <div class="kicker">Winning drawing</div>
      <div class="thumb"><DrawThumb :value="winner.drawing" :aspect="content.aspect" /></div>
      <p class="wauthor">by {{ winner.author }} &middot; {{ winner.votes }} vote{{ winner.votes === 1 ? '' : 's' }}</p>
    </div>
    <p v-if="votedWinner" class="myvote good">You picked the winner!</p>
    <p v-else-if="myInput?.choice" class="myvote">Your pick didn't take it this time.</p>
    <p v-else class="myvote muted">Results are up. Check the big screen!</p>
  </div>
</template>

<style scoped>
.dv-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
}
.kicker {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 800;
}
.thumb {
  width: 70%;
  max-width: 260px;
}
.wauthor {
  color: var(--c2);
  font-weight: 700;
}
.myvote {
  color: var(--ink-soft);
  font-weight: 600;
}
.myvote.good {
  color: var(--ok, var(--c5));
  font-weight: 800;
}
.myvote.muted {
  color: var(--mute);
}
</style>
