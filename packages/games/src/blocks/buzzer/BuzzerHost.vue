<script setup lang="ts">
/**
 * Big-screen gameshow stage for a buzzer question: a glowing point-value tag, the
 * answer board (lettered, illuminated panels), a live "locked in" count while
 * answering (never the distribution — that would tip the on-stage contestants),
 * and a dramatic reveal: the correct panel lights up, the rest dim, and a
 * spotlight crowns the first buzz-in. Answer + counts arrive only at reveal.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { BuzzerContent, BuzzerInput, BuzzerRevealSummary } from './block'

const props = defineProps<{
  content: BuzzerContent
  inputs: Map<string, BuzzerInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const revealed = computed(() => props.state === 'reveal')

const lockedCount = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice != null) n++
  return n
})

const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as BuzzerRevealSummary | undefined,
)
const correctIndex = computed(
  () => summary.value?.correctIndex ?? (props.answer as { correct?: number } | undefined)?.correct ?? -1,
)
const counts = computed(() => summary.value?.counts ?? props.content.options.map(() => 0))
// Resolve the buzz-in's name against the live roster by pid (robust if the
// published summary fell back to a placeholder), then the summary, then a default.
const firstName = computed(() => {
  const fc = summary.value?.firstCorrect
  if (!fc) return ''
  return room.players.value.find((p) => p.id === fc.pid)?.name || fc.name || 'Someone'
})
</script>

<template>
  <div class="stage">
    <div class="valuetag" :class="{ dim: revealed }">
      <span class="v">{{ content.points }}</span><span class="pts">PTS</span>
    </div>

    <ul class="board" :class="{ revealed }">
      <li
        v-for="(opt, i) in content.options"
        :key="i"
        class="panel"
        :class="{ right: revealed && i === correctIndex, wrong: revealed && i !== correctIndex }"
      >
        <span class="letter">{{ LETTERS[i] }}</span>
        <span class="label">{{ opt.label }}</span>
        <span v-if="revealed" class="count mono">{{ counts[i] ?? 0 }}</span>
        <span v-if="revealed && i === correctIndex" class="tick" aria-hidden="true">&#10003;</span>
      </li>
    </ul>

    <div v-if="!revealed" class="status">
      <span class="dot" aria-hidden="true" /> {{ lockedCount }} locked in
    </div>
    <div v-else class="spotlight">
      <template v-if="firstName">🔔 First buzz: <b>{{ firstName }}</b>!</template>
      <template v-else>Nobody got it. The answer stays a mystery to them.</template>
    </div>
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.valuetag {
  align-self: center;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 20px;
  border-radius: 999px;
  background: var(--c1);
  color: var(--primary-ink);
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow), var(--glow) color-mix(in srgb, var(--c1) 55%, transparent);
  font-family: var(--font-display);
  transition: filter 0.3s ease;
}
.valuetag.dim {
  filter: saturate(0.6) opacity(0.7);
}
.valuetag .v {
  font-size: clamp(26px, 3.4vw, 40px);
  font-weight: 800;
}
.valuetag .pts {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.12em;
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
  padding: 18px 18px;
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
.panel .label {
  flex: 1;
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
.status {
  align-self: center;
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
.spotlight {
  align-self: center;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 2.6vw, 30px);
  color: var(--ink);
}
.spotlight b {
  color: var(--primary);
}
</style>
