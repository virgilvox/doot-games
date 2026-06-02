<script setup lang="ts">
/**
 * Big-screen view for the Accuse round. Before the reveal it shows the clues
 * attributed to their authors (the room reads and debates) and a count of votes in,
 * never who is winning, so the vote isn't swayed. At reveal it unmasks the faker
 * and the secret word and shows the accusation tally.
 */
import type { RoundState } from '@doot-games/engine'
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { AccuseAnswer, AccuseContent, AccuseInput } from './block'

const props = defineProps<{
  content: AccuseContent
  inputs: Map<string, AccuseInput>
  state: RoundState
  answer?: unknown
}>()

const revealed = computed(() => props.state === 'reveal')
const ans = computed(() => (revealed.value ? (props.answer as AccuseAnswer | undefined) : undefined))
const votesIn = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice) n++
  return n
})

/** Reveal-time accusation tally, faker marked. */
const tallies = computed(() => {
  if (!revealed.value) return []
  const counts = new Map<string, number>()
  for (const [pid, v] of props.inputs) {
    if (!v?.choice || v.choice === pid) continue
    counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  }
  const nameOf = (pid: string) => ans.value?.names?.[pid] ?? props.content.clues.find((c) => c.pid === pid)?.name ?? 'Someone'
  const candidates = new Set<string>([...props.content.clues.map((c) => c.pid), ...counts.keys()])
  return [...candidates]
    .map((pid) => ({ pid, name: nameOf(pid), votes: counts.get(pid) ?? 0, isFaker: pid === ans.value?.fakerPid }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
})
const fakerName = computed(() => {
  const pid = ans.value?.fakerPid ?? ''
  return ans.value?.names?.[pid] ?? props.content.clues.find((c) => c.pid === pid)?.name ?? 'the faker'
})
const maxVotes = computed(() => Math.max(1, ...tallies.value.map((t) => t.votes)))
</script>

<template>
  <div class="accuse-host">
    <!-- REVEAL -->
    <template v-if="revealed">
      <div class="unmask" aria-live="polite">
        <div class="kicker"><Icon name="mask" :size="18" /> The faker was</div>
        <div class="faker-name">{{ fakerName }}</div>
        <div class="word-line">The word was <b>{{ ans?.word || '...' }}</b></div>
      </div>
      <ul class="tally">
        <li v-for="t in tallies" :key="t.pid" :class="{ faker: t.isFaker }">
          <span class="t-name">
            {{ t.name }}
            <span v-if="t.isFaker" class="tag"><Icon name="mask" :size="14" /> faker</span>
          </span>
          <span class="bar-wrap"><span class="bar" :style="{ width: `${(t.votes / maxVotes) * 100}%` }" /></span>
          <span class="t-votes mono">{{ t.votes }}</span>
        </li>
      </ul>
    </template>

    <!-- VOTING -->
    <template v-else>
      <div class="kicker"><Icon name="eye" :size="18" /> Who is the faker?</div>
      <div v-if="content.category" class="cat">Category: {{ content.category }}</div>
      <ul class="clue-grid">
        <li v-for="c in content.clues" :key="c.pid" class="clue">
          <span class="c-author">{{ c.name }}</span>
          <span class="c-word" :class="{ quiet: !c.clue }">{{ c.clue || '(no clue)' }}</span>
        </li>
      </ul>
      <p class="hint">{{ votesIn }} {{ votesIn === 1 ? 'vote' : 'votes' }} in. Talk it out, then point a finger.</p>
    </template>
  </div>
</template>

<style scoped>
.accuse-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}
.kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary);
  font-size: 15px;
}
.cat {
  font-weight: 700;
  color: var(--ink-soft);
}
.clue-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  width: 100%;
}
.clue {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
}
.c-author {
  font-weight: 700;
  color: var(--ink-soft);
  font-size: 14px;
}
.c-word {
  font-weight: 800;
  font-size: clamp(20px, 3.2vw, 30px);
  color: var(--ink);
}
.c-word.quiet {
  color: var(--ink-soft);
  font-style: italic;
  font-weight: 600;
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
.unmask {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.faker-name {
  font-size: clamp(36px, 8vw, 72px);
  font-weight: 900;
  color: var(--primary);
}
.word-line {
  font-weight: 600;
  color: var(--ink-soft);
  font-size: clamp(16px, 3vw, 22px);
}
.word-line b {
  color: var(--c5);
}
.tally {
  list-style: none;
  margin: 0;
  padding: 0;
  width: min(640px, 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tally li {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 2fr auto;
  align-items: center;
  gap: 12px;
}
.t-name {
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.tally li.faker .t-name {
  color: var(--primary);
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary);
  border: var(--bd) solid var(--primary);
  border-radius: 999px;
  padding: 1px 8px;
}
.bar-wrap {
  height: 14px;
  background: var(--surface-2);
  border-radius: 8px;
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  background: var(--c5);
  border-radius: 8px;
  transition: width 0.5s ease;
}
.tally li.faker .bar {
  background: var(--primary);
}
.t-votes {
  font-weight: 800;
}
</style>
