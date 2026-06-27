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
import { MediaFrame } from '@doot-games/ui'
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
const correctOption = computed(() =>
  correctIndex.value >= 0 ? props.content.options[correctIndex.value] : undefined,
)
// At the reveal, show a dedicated reveal picture if the author set one, else the
// correct answer's own picture (a picture quiz keeps its image), else nothing.
const revealImg = computed(() => props.content.revealImage?.trim() || correctOption.value?.image || '')
const answeredCount = computed(() => lockedCount.value)
const correctCount = computed(() => (correctIndex.value >= 0 ? (counts.value[correctIndex.value] ?? 0) : 0))

const showLetters = computed(() => props.content.showLetters !== false)
// `auto` stacks into one column when answers carry pictures or run long (so nothing
// is squeezed); otherwise a 2-up grid. `grid`/`list` force it.
const layoutClass = computed(() => {
  const mode = props.content.optionLayout ?? 'auto'
  if (mode === 'list' || mode === 'grid') return mode
  const heavy =
    props.content.options.some((o) => !!o.image) ||
    props.content.options.some((o) => (o.label ?? '').length > 24)
  return heavy ? 'list' : 'grid'
})

const letter = (i: number) => String.fromCharCode(65 + i)
</script>

<template>
  <div class="board-stage">
    <!-- Reveal: the answer on its own, so a long answer or a picture always fits
         (no cramped 4-up board, no clipped reveal). -->
    <div v-if="revealed" class="answer-focus">
      <MediaFrame v-if="revealImg" class="answer-img" :src="revealImg" fill max-h="min(54vh, 540px)" />
      <div class="answer-body">
        <span class="answer-kicker">The answer</span>
        <span class="answer-label">{{
          correctOption?.label || (correctIndex >= 0 ? `Option ${letter(correctIndex)}` : '—')
        }}</span>
        <span v-if="correctOption?.sublabel" class="answer-sub">{{ correctOption.sublabel }}</span>
        <span v-if="answeredCount > 0" class="answer-count">
          <span class="ac-num mono">{{ correctCount }}</span> of {{ answeredCount }} got it
        </span>
      </div>
    </div>

    <!-- Live board while answering. -->
    <template v-else>
      <ul class="board" :class="[layoutClass, { 'no-letters': !showLetters }]">
        <li v-for="(opt, i) in content.options" :key="i" class="panel">
          <span v-if="showLetters" class="letter">{{ letter(i) }}</span>
          <img v-if="opt.image" class="othumb" :src="opt.image" alt="" />
          <span class="label">
            <span class="ltext">{{ opt.label || `Option ${letter(i)}` }}</span>
            <span v-if="opt.sublabel" class="sub">{{ opt.sublabel }}</span>
          </span>
          <span v-if="showDistribution" class="count mono">{{ counts[i] ?? 0 }}</span>
        </li>
      </ul>

      <div class="status-row">
        <span class="status"><span class="dot" aria-hidden="true" /> {{ lockedCount }} locked in</span>
        <button type="button" class="peek" :aria-pressed="showLive" @click="showLive = !showLive">
          {{ showLive ? 'Hide answers' : 'Peek at answers' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.board-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
}
.board {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.board.grid {
  grid-template-columns: 1fr 1fr;
}
.board.list {
  grid-template-columns: 1fr;
}
@media (max-width: 1100px) {
  .board.grid {
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
  width: 64px;
  height: 64px;
  border-radius: 10px;
  object-fit: cover;
  border: var(--bd) solid var(--line-soft);
}
/* Letters off: the board is picture-led, so the answer picture grows. */
.board.no-letters .panel .othumb {
  width: 88px;
  height: 88px;
  border-radius: 12px;
}
.panel .label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.panel .sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft);
}
.panel .count {
  font-weight: 800;
  font-size: 20px;
  color: var(--ink-soft);
}
/* Focused reveal: the answer alone, centered, large. ---------------------- */
.answer-focus {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  text-align: center;
  gap: clamp(12px, 2vw, 22px);
}
/* The reveal picture fills the space above the answer label and hugs the image
   (MediaFrame fill): big, no crop, no letterbox gap. */
.answer-img {
  flex: 1;
  min-height: 0;
  max-width: 100%;
}
.answer-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.answer-kicker {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 14px;
  color: var(--c5);
}
.answer-label {
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1.05;
  font-size: clamp(30px, 5vw, 60px);
  overflow-wrap: anywhere;
  color: var(--ink);
}
.answer-sub {
  font-size: clamp(15px, 1.8vw, 22px);
  font-weight: 600;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}
.answer-count {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  color: var(--ink-soft);
}
.answer-count .ac-num {
  color: var(--c5);
  font-weight: 800;
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
