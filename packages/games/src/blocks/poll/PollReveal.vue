<script setup lang="ts">
/**
 * Phone reveal for a Poll: shows the player, on THEIR screen, what they picked and
 * where the room landed, so a player who can't see the big screen still gets the
 * payoff. A poll has no right answer, so this is "you vs the crowd", not scoring.
 */
import { computed } from 'vue'
import type { PollContent, PollInput, PollRevealSummary } from './block'

const props = defineProps<{
  content: PollContent
  myInput?: PollInput | null
  reveal?: PollRevealSummary | null
}>()

const myChoice = computed(() => props.myInput?.choice ?? null)
const myLabel = computed(() =>
  myChoice.value != null ? (props.content.options[myChoice.value]?.label ?? '') : '',
)
const topLabel = computed(() => props.reveal?.topLabel ?? '')
const withCrowd = computed(
  () => myChoice.value != null && props.reveal?.topIndex === myChoice.value && !!topLabel.value,
)
</script>

<template>
  <div class="poll-reveal big" aria-live="polite">
    <template v-if="myChoice == null">
      <h2>No vote</h2>
      <p v-if="topLabel">The room went with <b>{{ topLabel }}</b>.</p>
      <p v-else>No votes this round.</p>
    </template>
    <template v-else-if="withCrowd">
      <h2>With the crowd</h2>
      <p>You and the room both went <b>{{ myLabel }}</b>.</p>
    </template>
    <template v-else>
      <h2>You picked {{ myLabel }}</h2>
      <p v-if="topLabel">The room leaned <b>{{ topLabel }}</b>.</p>
    </template>
  </div>
</template>

<style scoped>
.poll-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.badge {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 34px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow-sm);
}
.poll-reveal h2 { font-size: clamp(26px, 7vw, 38px); font-weight: 800; }
.poll-reveal p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.poll-reveal b { color: var(--ink); }
</style>
