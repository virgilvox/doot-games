<script setup lang="ts">
/**
 * Big-screen photo vote: the gallery of shared photos. Vote counts stay hidden until
 * reveal (peek to show a live tally); at reveal the winner is crowned and each photo
 * is credited to its sharer.
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed, ref } from 'vue'
import type { PhotoVoteContent, PhotoVoteInput, PhotoVoteRevealSummary } from './block'

const props = defineProps<{
  content: PhotoVoteContent
  inputs: Map<string, PhotoVoteInput>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const revealed = computed(() => props.state === 'reveal')
const showLive = ref(props.content.hideUntilReveal === false)
const showDistribution = computed(() => revealed.value || showLive.value)
const votesIn = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.choice) n++
  return n
})

const authors = computed(
  () => (room.answerKeyFor(room.round.value.index) as { authors?: Record<string, string> } | undefined)?.authors ?? {},
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

const summary = computed(() => room.roundRevealFor(room.round.value.index) as PhotoVoteRevealSummary | undefined)

interface Cell {
  id: string
  media: string
  votes: number
  author?: string
  winner: boolean
}
const cells = computed<Cell[]>(() => {
  if (revealed.value && summary.value) {
    const win = summary.value.winnerId
    return summary.value.tallies.map((t) => ({ ...t, winner: t.id === win }))
  }
  return props.content.options.map((o) => ({
    id: o.id,
    media: o.media,
    votes: liveCounts.value.get(o.id) ?? 0,
    winner: false,
  }))
})
const tileMin = computed(() => {
  const n = cells.value.length
  if (n <= 4) return 260
  if (n <= 9) return 190
  if (n <= 16) return 150
  if (n <= 25) return 118
  return 96
})
</script>

<template>
  <div class="pv-host">
    <p v-if="cells.length < 2" class="degenerate">Not enough photos to vote on this round. Skip ahead.</p>
    <template v-else>
      <div v-if="!revealed" class="head">
        <span class="votes-in">{{ votesIn }} vote{{ votesIn === 1 ? '' : 's' }} in</span>
        <button type="button" class="peek" :aria-pressed="showLive" @click="showLive = !showLive">
          {{ showLive ? 'Hide votes' : 'Peek at votes' }}
        </button>
      </div>
      <div class="gallery" :style="{ '--tile-min': `${tileMin}px` }">
        <figure v-for="c in cells" :key="c.id" class="tile" :class="{ winner: revealed && c.winner }">
          <img :src="c.media" alt="A shared photo" class="photo" />
          <figcaption class="cap">
            <span v-if="revealed && c.winner" class="badge-win">WINNER</span>
            <span v-if="revealed && c.author" class="author">{{ c.author }}</span>
            <span v-if="showDistribution" class="votes mono">{{ c.votes }} vote{{ c.votes === 1 ? '' : 's' }}</span>
          </figcaption>
        </figure>
      </div>
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
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--tile-min, 180px), 1fr));
  gap: 12px;
  align-content: start;
  max-height: 74vh;
  overflow: auto;
}
.tile {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.photo {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
}
.tile.winner .photo {
  border-color: var(--c5);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c5) 45%, transparent);
}
.cap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 14px;
}
.badge-win {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--c5-ink, #06210f);
  background: var(--c5);
  border-radius: 999px;
  padding: 3px 9px;
}
.author {
  font-weight: 800;
  color: var(--c2);
}
.votes {
  font-weight: 800;
  color: var(--ink-soft);
}
.degenerate {
  color: var(--ink-soft);
  text-align: center;
  padding: 28px 0;
  font-weight: 600;
}
</style>
