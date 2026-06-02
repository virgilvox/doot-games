<script setup lang="ts">
/**
 * Big-screen Most Likely To view: a live "votes in" count while open (kept secret
 * so the room doesn't pile onto the leader), then the nomination bars at reveal
 * with the room's pick crowned. Names resolve from the roster, falling back to the
 * name captured on each vote.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { MostLikelyContent, MostLikelyInput, MostLikelyRevealSummary } from './block'

const props = defineProps<{
  content: MostLikelyContent
  inputs: Map<string, MostLikelyInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')
const votesIn = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice) n++
  return n
})

const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as MostLikelyRevealSummary | undefined,
)
const total = computed(() => (summary.value?.tallies ?? []).reduce((n, t) => n + t.votes, 0) || 1)
</script>

<template>
  <div class="ml-host">
    <template v-if="!revealed">
      <div class="big-count">
        <span class="num mono">{{ votesIn }}</span>
        <span class="lbl">{{ state === 'locked' ? 'votes locked in' : 'votes so far' }}</span>
      </div>
      <div v-if="state !== 'locked'" class="dots" aria-hidden="true"><span /><span /><span /></div>
      <p class="hint">{{ state === 'locked' ? 'Who did the room pick?' : 'Pointing fingers on their phones…' }}</p>
    </template>
    <template v-else>
      <ul class="rows">
        <li
          v-for="(t, i) in summary?.tallies ?? []"
          :key="t.pid"
          class="row"
          :class="{ winner: i === 0 && t.votes > 0 }"
        >
          <span class="fill" :style="{ width: `${(t.votes / total) * 100}%` }" aria-hidden="true" />
          <span class="text">
            <span v-if="i === 0 && t.votes > 0" class="crown" aria-label="winner">&#128081;</span>{{ t.name }}
          </span>
          <span class="votes mono">{{ t.votes }}</span>
        </li>
      </ul>
      <p v-if="!summary?.tallies.length" class="hint">No votes this round.</p>
    </template>
  </div>
</template>

<style scoped>
.ml-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 220px;
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
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--c3);
  animation: pop 1.2s ease-in-out infinite;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pop {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}
.hint { color: var(--ink-soft); font-weight: 600; }
.rows { list-style: none; display: grid; gap: 10px; width: min(620px, 92%); }
.row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  overflow: hidden;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.row.winner { border-color: var(--c5); background: color-mix(in srgb, var(--c5) 14%, var(--surface-2)); }
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-right: 2px solid var(--primary);
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 0;
}
.text, .votes { position: relative; z-index: 1; }
.text { font-weight: 700; font-size: clamp(16px, 2.4vw, 22px); overflow-wrap: anywhere; }
.crown { margin-right: 8px; }
.votes { font-weight: 800; font-size: 22px; color: var(--ink-soft); }
</style>
