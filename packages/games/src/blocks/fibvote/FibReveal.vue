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
const myLie = computed(() => {
  const prev = room.round.value.index - 1
  const mine = prev >= 0 ? (room.inputFor(prev) as { text?: string } | undefined) : undefined
  return mine?.text?.trim() ?? ''
})
const foundTruth = computed(() => !!props.reveal && props.myInput?.choice === props.reveal.truthId)
const fooled = computed(() => {
  if (!props.reveal || !myLie.value) return 0
  const mine = props.reveal.options.find((o) => !o.isTruth && o.text.trim() === myLie.value)
  return mine?.votes ?? 0
})
</script>

<template>
  <div class="fib-reveal big">
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
