<script setup lang="ts">
/**
 * Big-screen vote view: live tally bars while voting is open (authors withheld),
 * then the author reveal + a crowned winner at reveal. Author names come from the
 * public reveal summary the host published, so the big screen and phones agree.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { VoteContent, VoteInput, VoteRevealSummary } from './block'

const props = defineProps<{
  content: VoteContent
  inputs: Map<string, VoteInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')

// The host knows the author map locally (kept off the relay), so it can exclude
// self-votes from the LIVE tally too. Without this, a self-vote inflates the live
// count and the bar visibly shrinks at reveal (where self-votes are dropped).
const authors = computed(
  () =>
    (room.answerKeyFor(room.round.value.index) as { authors?: Record<string, string> } | undefined)
      ?.authors ?? {},
)
const liveCounts = computed(() => {
  const counts = new Map<string, number>(props.content.options.map((o) => [o.id, 0]))
  for (const [pid, v] of props.inputs) {
    if (!v?.choice || !counts.has(v.choice)) continue
    if (authors.value[v.choice] === pid) continue // self-vote: not counted
    counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  }
  return counts
})

const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as VoteRevealSummary | undefined,
)

interface Row {
  id: string
  text: string
  votes: number
  author?: string
  winner: boolean
}
const rows = computed<Row[]>(() => {
  if (revealed.value && summary.value) {
    const win = summary.value.winnerId
    return summary.value.tallies.map((t) => ({ ...t, winner: t.id === win }))
  }
  return props.content.options
    .map((o) => ({ id: o.id, text: o.text, votes: liveCounts.value.get(o.id) ?? 0, winner: false }))
    .sort((a, b) => b.votes - a.votes)
})
const total = computed(() => rows.value.reduce((n, r) => n + r.votes, 0) || 1)
</script>

<template>
  <div class="vote-host">
    <p v-if="rows.length < 2" class="degenerate">
      Not enough answers to vote on this round. Skip ahead.
    </p>
    <ul v-else class="rows">
      <li v-for="r in rows" :key="r.id" class="row" :class="{ winner: r.winner }">
        <span class="fill" :style="{ width: `${(r.votes / total) * 100}%` }" aria-hidden="true" />
        <span class="text">
          <span v-if="r.winner" class="crown" aria-label="winner">&#127942;</span>{{ r.text }}
        </span>
        <span class="meta">
          <span v-if="revealed && r.author" class="author">{{ r.author }}</span>
          <span class="votes mono">{{ r.votes }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rows {
  list-style: none;
  display: grid;
  gap: 10px;
}
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
.row.winner {
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 14%, var(--surface-2));
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-right: 2px solid var(--primary);
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 0;
}
.text,
.meta {
  position: relative;
  z-index: 1;
}
.text {
  font-weight: 700;
  font-size: clamp(16px, 2.2vw, 22px);
  overflow-wrap: anywhere;
  min-width: 0;
}
.degenerate {
  color: var(--ink-soft);
  text-align: center;
  padding: 28px 0;
  font-weight: 600;
}
.crown {
  margin-right: 8px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.author {
  font-weight: 800;
  color: var(--c2);
  font-size: 14px;
}
.votes {
  font-weight: 800;
  font-size: 22px;
  color: var(--ink-soft);
  min-width: 1.5ch;
  text-align: right;
}
</style>
