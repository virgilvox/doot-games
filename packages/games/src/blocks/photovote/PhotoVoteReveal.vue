<script setup lang="ts">
/** Phone reveal: which photo won (on your screen, not just the big one), and whether
 *  you voted for it. */
import { computed } from 'vue'
import type { PhotoVoteContent, PhotoVoteInput, PhotoVoteRevealSummary } from './block'

const props = defineProps<{
  content: PhotoVoteContent
  myInput?: PhotoVoteInput | null
  reveal?: PhotoVoteRevealSummary | null
}>()

// Only crown a winner when one actually drew votes (winnerId is null at 0 votes).
const winner = computed(() => {
  const r = props.reveal
  if (!r?.winnerId) return null
  return r.tallies.find((t) => t.id === r.winnerId) ?? null
})
const votedWinner = computed(() => !!winner.value && props.myInput?.choice === winner.value.id)
</script>

<template>
  <div class="pv-reveal big" role="status" aria-live="polite">
    <div v-if="winner" class="winner">
      <div class="kicker">Winning photo</div>
      <div class="thumb"><img :src="winner.media" alt="Winning photo" class="photo" /></div>
      <p class="wauthor">by {{ winner.author }} &middot; {{ winner.votes }} vote{{ winner.votes === 1 ? '' : 's' }}</p>
    </div>
    <p v-if="votedWinner" class="myvote good">You picked the winner!</p>
    <p v-else-if="myInput?.choice" class="myvote">Your pick didn't take it this time.</p>
    <p v-else class="myvote muted">Results are up. Check the big screen!</p>
  </div>
</template>

<style scoped>
.pv-reveal {
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
.photo {
  width: 100%;
  border-radius: 12px;
  display: block;
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
