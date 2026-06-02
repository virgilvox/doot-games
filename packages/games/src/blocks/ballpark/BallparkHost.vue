<script setup lang="ts">
/**
 * Big-screen Ballpark view. While guessing it shows only a count (showing guesses
 * would let people copy). At reveal it draws a dial: every guess is a tick along
 * the line, the true answer is the flag, and the closest guess is crowned. The
 * answer flag slides in via CSS for the needle moment.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { BallparkContent, BallparkInput, BallparkRevealSummary } from './block'

const props = defineProps<{
  content: BallparkContent
  inputs: Map<string, BallparkInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')
const guessesIn = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.value != null && Number.isFinite(v.value)) n++
  return n
})

const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as BallparkRevealSummary | undefined,
)
const span = computed(() => {
  const s = summary.value
  return s ? Math.max(1e-9, s.hi - s.lo) : 1
})
function pct(value: number): number {
  const s = summary.value
  if (!s) return 50
  return Math.min(100, Math.max(0, ((value - s.lo) / span.value) * 100))
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
</script>

<template>
  <div class="bp-host">
    <template v-if="!revealed">
      <div class="big-count">
        <span class="num mono">{{ guessesIn }}</span>
        <span class="lbl">{{ state === 'locked' ? 'guesses locked in' : 'guesses so far' }}</span>
      </div>
      <div v-if="state !== 'locked'" class="dots" aria-hidden="true"><span /><span /><span /></div>
      <p class="hint">{{ state === 'locked' ? 'Where does the needle land?' : 'Crunching numbers…' }}</p>
    </template>
    <template v-else-if="summary && summary.answer != null">
      <div class="answer">
        <span class="anum mono">{{ fmt(summary.answer) }}</span>
        <span v-if="summary.unit" class="aunit">{{ summary.unit }}</span>
      </div>
      <div class="dial" role="img" :aria-label="`The answer was ${summary.answer} ${summary.unit}`">
        <div class="track" />
        <div class="flag" :style="{ left: `${pct(summary.answer)}%` }">
          <span class="flag-stick" />
          <span class="flag-dot" />
        </div>
        <div
          v-for="m in summary.marks"
          :key="m.pid"
          class="mark"
          :class="{ closest: m.pid === summary.closestPid }"
          :style="{ left: `${pct(m.value)}%` }"
        >
          <span class="tick" />
          <span class="tag">{{ m.name }} <b class="mono">{{ fmt(m.value) }}</b></span>
        </div>
      </div>
      <p v-if="!summary.marks.length" class="hint">No guesses this round.</p>
    </template>
  </div>
</template>

<style scoped>
.bp-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: 240px;
  width: 100%;
}
.big-count { display: flex; flex-direction: column; align-items: center; }
.num { font-size: clamp(56px, 12vw, 120px); font-weight: 800; line-height: 1; color: var(--primary); }
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 14px;
}
.dots { display: flex; gap: 10px; }
.dots span {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--c3); animation: pop 1.2s ease-in-out infinite;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pop {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}
.hint { color: var(--ink-soft); font-weight: 600; }
.answer { display: flex; align-items: baseline; gap: 8px; }
.anum {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(40px, 9vw, 88px);
  line-height: 1;
  color: var(--c5);
}
.aunit { font-weight: 800; font-size: 24px; color: var(--ink-soft); }
.dial {
  position: relative;
  width: min(760px, 88%);
  height: 120px;
  margin-top: 8px;
}
.track {
  position: absolute;
  left: 0; right: 0; top: 58px;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 2px solid var(--line-soft);
}
.flag {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  transition: left 0.9s cubic-bezier(0.2, 0.9, 0.2, 1);
}
.flag-stick {
  display: block;
  width: 3px;
  height: 56px;
  margin: 0 auto;
  background: var(--c5);
}
.flag-dot {
  position: absolute;
  bottom: -6px; left: 50%;
  transform: translateX(-50%);
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--c5);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--c5) 30%, transparent);
}
.mark {
  position: absolute;
  top: 50px;
  transform: translateX(-50%);
}
.tick {
  display: block;
  width: 10px; height: 10px;
  margin: 0 auto;
  border-radius: 50%;
  background: var(--ink-soft);
  border: 2px solid var(--surface);
}
.mark.closest .tick {
  background: var(--primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 35%, transparent);
}
.tag {
  position: absolute;
  top: 16px; left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
}
.mark.closest .tag { color: var(--primary); }
.tag b { color: var(--ink); }
</style>
