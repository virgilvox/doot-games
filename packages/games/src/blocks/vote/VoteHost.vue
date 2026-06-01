<script setup lang="ts">
/**
 * Big-screen vote view: live tally bars while voting is open (authors withheld),
 * then the author reveal + a crowned winner at reveal. Author names come from the
 * public reveal summary the host published, so the big screen and phones agree.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { Icon, RobotRapper, cancelSpeech, speakLines } from '@doot-games/ui'
import { computed, onUnmounted, ref } from 'vue'
import type { VoteContent, VoteInput, VoteRevealSummary } from './block'

const props = defineProps<{
  content: VoteContent
  inputs: Map<string, VoteInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')

// Keep where the room is voting secret until reveal, for a real reveal moment.
// Default to hidden (so a careless host gets the un-spoiled reveal); only an author
// who explicitly set hideUntilReveal=false starts live. The host can peek mid-round.
// This is the host's own big screen only; nothing about it is published.
const showLive = ref(props.content.hideUntilReveal === false)
const showDistribution = computed(() => revealed.value || showLive.value)
const votesIn = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice) n++
  return n
})

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
  const base = props.content.options.map((o) => ({
    id: o.id,
    text: o.text,
    votes: liveCounts.value.get(o.id) ?? 0,
    winner: false,
  }))
  // While the distribution is hidden, keep the authored order: sorting by votes
  // would float the leading answer to the top and leak who's winning early.
  return showDistribution.value ? base.sort((a, b) => b.votes - a.votes) : base
})
const total = computed(() => rows.value.reduce((n, r) => n + r.votes, 0) || 1)

// "Perform the bars": robots read each answer aloud (the rap-battle moment).
// Opt-in via `content.perform`; client-only TTS that no-ops where unavailable,
// so the vote flow never depends on it. Highlight the verse being performed.
const canPerform = computed(() => !!props.content.perform && !revealed.value && rows.value.length >= 2)
const performing = ref(false)
const currentId = ref<string | null>(null)
let stopFn: (() => void) | null = null
function perform() {
  // Snapshot the current order so live votes re-sorting the rows can't make the
  // highlight jump mid-performance.
  const snapshot = rows.value.map((r) => ({ id: r.id, text: r.text }))
  performing.value = true
  stopFn = speakLines(
    snapshot.map((r) => r.text),
    {
      onLine: (i) => {
        currentId.value = snapshot[i]?.id ?? null
      },
      onDone: () => {
        performing.value = false
        currentId.value = null
        stopFn = null
      },
    },
  )
}
function stopPerform() {
  stopFn?.()
  stopFn = null
  performing.value = false
  currentId.value = null
}
// The verse currently being rapped (shown in the robot's speech bubble).
const currentText = computed(() => rows.value.find((r) => r.id === currentId.value)?.text ?? '')
onUnmounted(() => cancelSpeech())
</script>

<template>
  <div class="vote-host">
    <div v-if="canPerform" class="perform-bar">
      <button type="button" class="perform-btn" :class="{ on: performing }" @click="performing ? stopPerform() : perform()">
        <span v-if="!performing">&#9654; Perform the bars</span>
        <span v-else>&#9632; Stop</span>
      </button>
      <span v-if="performing" class="beat" aria-hidden="true"><i /><i /><i /><i /></span>
      <span class="perform-hint"><Icon v-if="performing" name="mic" :size="15" />{{ performing ? ' On the mic now…' : 'Let the robots rap each verse, then vote.' }}</span>
    </div>
    <!-- The animated robot performing the current verse. -->
    <div v-if="canPerform && performing" class="stage">
      <RobotRapper :speaking="true" :size="190" accent="var(--primary)" name="MC Doot" />
      <p class="verse" aria-live="polite">{{ currentText }}</p>
    </div>
    <p v-if="rows.length < 2" class="degenerate">
      Not enough answers to vote on this round. Skip ahead.
    </p>
    <template v-else>
      <div v-if="!revealed" class="peek-bar">
        <span class="votes-in">{{ votesIn }} vote{{ votesIn === 1 ? '' : 's' }} in</span>
        <button type="button" class="peek" :aria-pressed="showLive" @click="showLive = !showLive">
          {{ showLive ? 'Hide votes' : 'Peek at votes' }}
        </button>
      </div>
      <ul class="rows">
        <li v-for="r in rows" :key="r.id" class="row" :class="{ winner: r.winner, performing: r.id === currentId }">
          <span v-if="showDistribution" class="fill" :style="{ width: `${(r.votes / total) * 100}%` }" aria-hidden="true" />
          <span class="text">
            <span v-if="r.winner" class="crown" aria-label="winner">&#127942;</span>{{ r.text }}
          </span>
          <span class="meta">
            <span v-if="revealed && r.author" class="author">{{ r.author }}</span>
            <span v-if="showDistribution" class="votes mono">{{ r.votes }}</span>
          </span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.peek-bar {
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
.row.performing {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 35%, transparent);
  transform: scale(1.015);
}
/* Perform-the-bars control + beat indicator. */
.perform-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.perform-btn {
  border: var(--bd) solid var(--line);
  background: var(--primary);
  color: var(--primary-ink);
  font-family: inherit;
  font-weight: 800;
  font-size: 16px;
  padding: 10px 18px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.perform-btn.on {
  background: var(--ink);
  color: var(--bg);
}
.perform-hint {
  color: var(--ink-soft);
  font-weight: 600;
  font-size: 14px;
}
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px 0 18px;
}
.verse {
  position: relative;
  max-width: 32ch;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 3vw, 32px);
  line-height: 1.3;
  color: var(--ink);
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  box-shadow: var(--shadow);
  white-space: pre-line;
}
.beat {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 22px;
}
.beat i {
  width: 4px;
  height: 100%;
  border-radius: 2px;
  background: var(--primary);
  transform-origin: bottom;
  animation: beat 0.6s ease-in-out infinite;
}
.beat i:nth-child(2) {
  animation-delay: 0.15s;
}
.beat i:nth-child(3) {
  animation-delay: 0.3s;
}
.beat i:nth-child(4) {
  animation-delay: 0.45s;
}
@keyframes beat {
  0%,
  100% {
    transform: scaleY(0.35);
  }
  50% {
    transform: scaleY(1);
  }
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
