<script setup lang="ts">
/**
 * Big-screen Split the Room view: a two-sided YES/NO bar per scenario (live,
 * authors withheld), then authors + closeness points at reveal. The closer to a
 * 50/50 split, the more the author scored.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { SplitContent, SplitInput, SplitRevealSummary } from './block'

const props = defineProps<{
  content: SplitContent
  inputs: Map<string, SplitInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')
const authors = computed(
  () =>
    (room.answerKeyFor(room.round.value.index) as { authors?: Record<string, string> } | undefined)
      ?.authors ?? {},
)
const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as SplitRevealSummary | undefined,
)

interface Row {
  id: string
  text: string
  yes: number
  no: number
  author?: string
  points?: number
}
const rows = computed<Row[]>(() => {
  if (revealed.value && summary.value) return summary.value.results
  return props.content.scenarios.map((s) => {
    let yes = 0
    let no = 0
    const authorPid = authors.value[s.id]
    for (const [pid, input] of props.inputs) {
      if (pid === authorPid) continue
      const v = input?.votes?.[s.id]
      if (v === 'yes') yes++
      else if (v === 'no') no++
    }
    return { id: s.id, text: s.text, yes, no }
  })
})
function yesPct(r: Row) {
  const t = r.yes + r.no
  return t > 0 ? (r.yes / t) * 100 : 50
}
</script>

<template>
  <div class="split-host">
    <ul class="rows">
      <li v-for="r in rows" :key="r.id" class="row">
        <div class="rtop">
          <span class="text">{{ r.text }}</span>
          <span v-if="revealed && r.points != null" class="pts mono">{{ r.points }} pts</span>
        </div>
        <div class="bar" :class="{ even: Math.abs(yesPct(r) - 50) < 8 && r.yes + r.no > 0 }">
          <span class="yes" :style="{ width: `${yesPct(r)}%` }">{{ r.yes }}</span>
          <span class="no">{{ r.no }}</span>
        </div>
        <div class="rfoot">
          <span class="yn">Yes / No</span>
          <span v-if="revealed && r.author" class="author">by {{ r.author }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rows {
  list-style: none;
  display: grid;
  gap: 14px;
}
.row {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.rtop {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 8px;
}
.text {
  font-weight: 700;
  font-size: clamp(15px, 1.9vw, 19px);
  overflow-wrap: anywhere;
}
.pts {
  font-weight: 800;
  color: var(--c2);
  flex: none;
}
.bar {
  display: flex;
  height: 30px;
  border-radius: 999px;
  overflow: hidden;
  border: 2px solid var(--line-soft);
  background: var(--primary);
}
.bar.even {
  border-color: var(--c5);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--c5) 40%, transparent);
}
.bar .yes {
  background: var(--c5);
  color: var(--primary-ink);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 10px;
  font-weight: 800;
  font-size: 13px;
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  min-width: 1.6em;
}
.bar .no {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10px;
  color: var(--primary-ink);
  font-weight: 800;
  font-size: 13px;
}
.rfoot {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-soft);
}
.author {
  font-weight: 800;
  color: var(--c2);
}
</style>
