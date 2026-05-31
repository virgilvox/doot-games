<script setup lang="ts">
/**
 * Big-screen gameshow board for a guess question: lettered, illuminated answer
 * panels, a live "locked in" count while answering (never the distribution,
 * which would spoil the reveal), and a dramatic reveal where the correct panel
 * lights up with a check, the rest dim, and the vote counts arrive. The host can
 * "peek" at the live tally if they want it; authors set the default per round.
 * The question prompt and image are drawn by the shared host frame (GameHost),
 * so this owns only the board.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed, ref } from 'vue'
import type { GuessContent, GuessInput } from './block'

const props = defineProps<{
  content: GuessContent
  inputs: Map<string, GuessInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')

// Keep where the crowd is leaning secret until reveal so the answer isn't tipped.
// Default to hidden (so a careless host gets the un-spoiled reveal); only an
// author who explicitly set hideUntilReveal=false starts live. The host can peek
// mid-round. This is the host's own screen only; it never publishes anything.
const showLive = ref(props.content.hideUntilReveal === false)
const showDistribution = computed(() => revealed.value || showLive.value)

const lockedCount = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice != null) n++
  return n
})

const counts = computed(() => {
  const out = props.content.options.map(() => 0)
  for (const v of props.inputs.values()) {
    const choice = v?.choice
    if (choice != null && out[choice] != null) out[choice]++
  }
  return out
})

// The correct index comes from the public reveal summary (so big screen + phones
// agree), falling back to the answer key (which GameHost only provides at reveal).
const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as { correctIndex?: number } | undefined,
)
const correctIndex = computed(
  () =>
    summary.value?.correctIndex ??
    (props.answer as { correct?: number } | undefined)?.correct ??
    -1,
)

const letter = (i: number) => String.fromCharCode(65 + i)
</script>

<template>
  <div class="board-stage">
    <ul class="board" :class="{ revealed }">
      <li
        v-for="(opt, i) in content.options"
        :key="i"
        class="panel"
        :class="{ right: revealed && i === correctIndex, wrong: revealed && i !== correctIndex }"
      >
        <span class="letter">{{ letter(i) }}</span>
        <img v-if="opt.image" class="othumb" :src="opt.image" alt="" />
        <span class="label">{{ opt.label || `Option ${letter(i)}` }}</span>
        <span v-if="showDistribution" class="count mono">{{ counts[i] ?? 0 }}</span>
        <span v-if="revealed && i === correctIndex" class="tick" aria-hidden="true">&#10003;</span>
      </li>
    </ul>

    <div v-if="!revealed" class="status-row">
      <span class="status"><span class="dot" aria-hidden="true" /> {{ lockedCount }} locked in</span>
      <button type="button" class="peek" :aria-pressed="showLive" @click="showLive = !showLive">
        {{ showLive ? 'Hide answers' : 'Peek at answers' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.board-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.board {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
@media (max-width: 1100px) {
  .board {
    grid-template-columns: 1fr;
  }
}
.panel {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  box-shadow: var(--shadow-sm);
  font-weight: 700;
  font-size: clamp(17px, 2vw, 24px);
  overflow: hidden;
  transition: transform 0.25s ease, border-color 0.25s ease, background 0.25s ease, opacity 0.25s ease;
}
.panel .letter {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  color: var(--primary-ink);
  background: var(--primary);
  border: var(--bd) solid var(--line);
}
.panel .othumb {
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 9px;
  object-fit: cover;
  border: var(--bd) solid var(--line-soft);
}
.panel .label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.panel .count {
  font-weight: 800;
  font-size: 20px;
  color: var(--ink-soft);
}
.panel.right {
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 22%, var(--surface));
  transform: scale(1.03);
  box-shadow: var(--shadow), var(--glow) color-mix(in srgb, var(--c5) 60%, transparent);
}
.panel.right .letter {
  background: var(--c5);
}
.panel.wrong {
  opacity: 0.45;
}
.tick {
  flex: none;
  color: var(--c5);
  font-size: 26px;
  font-weight: 900;
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-weight: 800;
  font-size: 18px;
  color: var(--ink-soft);
}
.status .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--c3);
  animation: live 1.1s ease-in-out infinite;
}
@keyframes live {
  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.5;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
.peek {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  color: var(--ink-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.peek:hover {
  border-color: var(--line);
  color: var(--ink);
}
.peek[aria-pressed='true'] {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--line);
}
@media (prefers-reduced-motion: reduce) {
  .panel,
  .status .dot {
    transition: none;
    animation: none;
  }
}
</style>
