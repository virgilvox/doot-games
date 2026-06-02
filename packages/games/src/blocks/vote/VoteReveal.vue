<script setup lang="ts">
/**
 * Phone reveal: tells the player how the vote landed on THEIR screen, not just
 * the big one (closing the "answers are up, look at the big screen" gap). Shows
 * the winner and what the player voted for.
 */
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { VoteContent, VoteInput, VoteRevealSummary } from './block'

const props = defineProps<{
  content: VoteContent
  myInput?: VoteInput | null
  reveal?: VoteRevealSummary | null
}>()

const winner = computed(() => props.reveal?.tallies?.[0] ?? null)
const myVoteText = computed(() => {
  const id = props.myInput?.choice
  return id ? (props.content.options.find((o) => o.id === id)?.text ?? null) : null
})
</script>

<template>
  <div class="vote-reveal big">
    <div v-if="winner" class="winner">
      <div class="kicker">Winner</div>
      <p class="wtext"><Icon name="crown" :size="20" /> &ldquo;{{ winner.text }}&rdquo;</p>
      <p class="wauthor">by {{ winner.author }} &middot; {{ winner.votes }} vote{{ winner.votes === 1 ? '' : 's' }}</p>
    </div>
    <p v-if="myVoteText" class="myvote">You voted for &ldquo;{{ myVoteText }}&rdquo;</p>
    <p v-else class="myvote muted">Results are up. Check the big screen!</p>
  </div>
</template>

<style scoped>
.vote-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 16px;
}
.kicker {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 800;
}
.wtext {
  font-size: clamp(22px, 6vw, 30px);
  font-weight: 800;
  max-width: 24ch;
  overflow-wrap: anywhere;
}
.wauthor {
  color: var(--c2);
  font-weight: 700;
  margin-top: 4px;
}
.myvote {
  color: var(--ink-soft);
  font-weight: 600;
}
.myvote.muted {
  color: var(--mute);
}
</style>
