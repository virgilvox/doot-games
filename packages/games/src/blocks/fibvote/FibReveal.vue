<script setup lang="ts">
/**
 * Phone reveal: did you find the truth, and how many players did your lie fool?
 * The player's own lie comes from their make-round submission (the relay only
 * gives a player their own input); the vote counts come from the reveal summary.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { FibContent, FibInput, FibRevealSummary } from './block'

const props = defineProps<{
  content: FibContent
  myInput?: FibInput | null
  reveal?: FibRevealSummary | null
}>()

const room = injectDootRoom()
const foundTruth = computed(() => !!props.reveal && props.myInput?.choice === props.reveal.truthId)
// Find my own lie option by author id (authorship is public at reveal), so the
// "you fooled N" count is right even if two players wrote the same lie text.
const fooled = computed(() => {
  const r = props.reveal
  const myId = room.me.value.id
  if (!r || !myId) return 0
  const myOptId = Object.entries(r.authors).find(([, pid]) => pid === myId)?.[0]
  if (!myOptId) return 0
  return r.options.find((o) => o.id === myOptId)?.votes ?? 0
})
</script>

<template>
  <div class="fib-reveal big" role="status" aria-live="polite">
    <div v-if="reveal" class="truth">
      <div class="kicker">The truth was</div>
      <p class="ttext">&ldquo;{{ reveal.truthText }}&rdquo;</p>
    </div>
    <p v-if="foundTruth" class="verdict good">You found the truth!</p>
    <p v-else-if="myInput?.choice" class="verdict bad">You got fooled.</p>
    <p v-if="fooled > 0" class="fooled">
      Your lie fooled {{ fooled }} {{ fooled === 1 ? 'player' : 'players' }}.
    </p>
  </div>
</template>

<style scoped>
.fib-reveal {
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
.ttext {
  font-size: clamp(22px, 6vw, 30px);
  font-weight: 800;
  max-width: 24ch;
  overflow-wrap: anywhere;
}
.verdict {
  font-weight: 800;
  font-size: 18px;
}
.verdict.good {
  color: var(--ok, var(--c5));
}
.verdict.bad {
  color: var(--ink-soft);
}
.fooled {
  color: var(--c2);
  font-weight: 700;
}
</style>
