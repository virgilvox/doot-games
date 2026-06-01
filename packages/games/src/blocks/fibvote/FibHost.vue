<script setup lang="ts">
/**
 * Big-screen fib vote: the trivia question, then the lies mixed with the one
 * true answer. While voting is open the tally is hidden (peek to reveal); at
 * reveal the true answer is marked TRUTH, lies are credited to their author,
 * and the vote counts show who got fooled.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { FibContent, FibInput, FibRevealSummary } from './block'

const props = defineProps<{
  content: FibContent
  inputs: Map<string, FibInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')
const showLive = computed(() => props.content.hideUntilReveal === false)
const showDistribution = computed(() => revealed.value || showLive.value)

const votesIn = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice) n++
  return n
})

const authors = computed(
  () =>
    (room.answerKeyFor(room.round.value.index) as { authors?: Record<string, string> } | undefined)
      ?.authors ?? {},
)
const liveCounts = computed(() => {
  const counts = new Map<string, number>(props.content.options.map((o) => [o.id, 0]))
  for (const [pid, v] of props.inputs) {
    if (!v?.choice || !counts.has(v.choice)) continue
    if (authors.value[v.choice] === pid) continue
    counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  }
  return counts
})

const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as FibRevealSummary | undefined,
)

interface Row {
  id: string
  text: string
  votes: number
  author: string | null
  isTruth: boolean
}
const rows = computed<Row[]>(() => {
  if (revealed.value && summary.value) return summary.value.options
  const base = props.content.options.map((o) => ({
    id: o.id,
    text: o.text,
    votes: liveCounts.value.get(o.id) ?? 0,
    author: null,
    isTruth: false,
  }))
  // Keep authored (shuffled) order while hidden so the leader doesn't float up.
  return showDistribution.value ? base.sort((a, b) => b.votes - a.votes) : base
})
const total = computed(() => rows.value.reduce((n, r) => n + r.votes, 0) || 1)
</script>

<template>
  <div class="fib-host">
    <p v-if="rows.length < 2" class="degenerate">
      Not enough answers to vote on this round. Skip ahead.
    </p>
    <template v-else>
      <div v-if="!revealed" class="head">
        <span class="votes-in">{{ votesIn }} vote{{ votesIn === 1 ? '' : 's' }} in</span>
        <span class="lead">Spot the truth</span>
      </div>
      <ul class="rows">
        <li v-for="r in rows" :key="r.id" class="row" :class="{ truth: revealed && r.isTruth }">
          <span v-if="showDistribution" class="fill" :style="{ width: `${(r.votes / total) * 100}%` }" aria-hidden="true" />
          <span class="text">
            <span v-if="revealed && r.isTruth" class="badge-truth">TRUTH</span>{{ r.text }}
          </span>
          <span class="meta">
            <span v-if="revealed && !r.isTruth && r.author" class="author">{{ r.author }}'s lie</span>
            <span v-if="showDistribution" class="votes mono">{{ r.votes }}</span>
          </span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.votes-in {
  font-weight: 800;
  font-size: 15px;
  color: var(--ink-soft);
}
.lead {
  font-weight: 800;
  font-size: 15px;
  color: var(--ink-soft);
}
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
.row.truth {
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 16%, var(--surface-2));
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
  display: flex;
  align-items: center;
  gap: 10px;
}
.badge-truth {
  flex: none;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--c5-ink, #06210f);
  background: var(--c5);
  border-radius: 999px;
  padding: 3px 9px;
}
.degenerate {
  color: var(--ink-soft);
  text-align: center;
  padding: 28px 0;
  font-weight: 600;
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
