<script setup lang="ts">
/** Final standings, winner emphasized. Reads the SDK's LeaderboardEntry shape. */
import { computed } from 'vue'
import Avatar from './Avatar.vue'

interface Entry {
  id?: string
  name: string
  score: number
  detail?: string
}
const props = withDefaults(
  defineProps<{
    entries: Entry[]
    /** The viewing player: their id (preferred) or their name. Their row is marked. */
    highlight?: string | null
    max?: number
    /** Lay the board out in this many columns. The host big screen is WIDE and
     *  height-bound, so two columns fit twice the board in the same height; a phone
     *  stays at one. The winner always spans the full width. */
    columns?: number
    /** Say how many players did not fit ("+ 190 more"), instead of a board that
     *  silently stops. Off on a surface where the count would just be noise. */
    showRest?: boolean
    /** Keep the highlighted player's row on the board even when they placed below
     *  the cut, shown after the "+ N more" line. In a big room most players are not
     *  in the top few, and a board that never shows them their own score is the
     *  wrong answer to the only question they came to the results page with. */
    pinHighlighted?: boolean
  }>(),
  { highlight: null, max: 8, columns: 1, showRest: false, pinHighlighted: false },
)

// Hiding exactly one player behind a "+ 1 more" line is worse than just showing them,
// so the cut stretches by one rather than trading a row for a footnote.
const shown = computed(() => (props.entries.length === props.max + 1 ? props.max + 1 : props.max))
// Competition ranking so a tie shares a place: co-leaders all get rank 1 (★) and
// the next entry is rank 3, not 2. Only crown (★) when the top score is above 0.
//
// Counted from a tally of distinct scores rather than by re-scanning the list per
// entry: the naive form is O(N^2), and a 200-player room pays that on every results
// render. Same numbers, one pass plus a sort of the distinct scores.
const ranked = computed(() => {
  const counts = new Map<number, number>()
  for (const e of props.entries) counts.set(e.score, (counts.get(e.score) ?? 0) + 1)
  const descending = [...counts.keys()].sort((a, b) => b - a)
  const above = new Map<number, number>()
  let seen = 0
  for (const score of descending) {
    above.set(score, seen)
    seen += counts.get(score) ?? 0
  }
  const top = descending[0]
  // Hero the winner's row ONLY when there is one winner. A seven-way tie used to
  // render seven full-width hero rows, which filled the big screen and read as seven
  // separate winners; every co-leader still gets the star.
  const soleLeader = top !== undefined && top > 0 && (counts.get(top) ?? 0) === 1
  return props.entries.slice(0, shown.value).map((e) => {
    const leader = e.score > 0 && top !== undefined && e.score >= top
    return { ...e, rank: 1 + (above.get(e.score) ?? 0), leader, hero: leader && soleLeader }
  })
})
/** The viewer's own row, when they placed below the cut and asked to be pinned. */
const pinnedRow = computed(() => {
  if (!props.pinHighlighted || !props.highlight) return null
  if (ranked.value.some((e) => isMe(e))) return null
  const i = props.entries.findIndex((e) => isMe(e))
  if (i < 0) return null
  const e = props.entries[i] as Entry
  return { ...e, rank: 1 + props.entries.filter((o) => o.score > e.score).length, leader: false }
})
// The pinned viewer is one of the players below the cut, and is shown right under
// this line, so counting them as "not fitting" would be off by one.
const hiddenCount = computed(() =>
  Math.max(0, props.entries.length - shown.value - (pinnedRow.value ? 1 : 0)),
)
// Match on id first: names are not unique (two Sams collide) and a player whose name
// was masked by the profanity filter would never match their own row.
const isMe = (e: Entry) => !!props.highlight && (e.id === props.highlight || e.name === props.highlight)
</script>

<template>
  <div class="lb-wrap">
    <ol class="lb" :class="{ cols: columns > 1 }" :style="{ '--lb-cols': columns }">
      <li
        v-for="e in ranked"
        :key="e.id ?? e.name"
        class="lb-row"
        :class="{ first: e.hero, crowned: e.leader, me: isMe(e) }"
      >
        <span class="rank">{{ e.leader ? '★' : e.rank }}</span>
        <Avatar :name="e.name" :id="e.id ?? e.name" :size="e.leader ? 44 : 32" class="av" />
        <span class="who">
          <span class="nm">
            {{ e.name }}
            <!-- Colour alone must never carry meaning, so the viewer's own row is
                 labelled as well as tinted. -->
            <span v-if="isMe(e)" class="you">You</span>
          </span>
          <span v-if="e.detail" class="dt">{{ e.detail }}</span>
        </span>
        <span class="sc mono">{{ e.score }}</span>
      </li>
    </ol>
    <p v-if="showRest && hiddenCount" class="lb-rest mono">
      + {{ hiddenCount }} more player{{ hiddenCount === 1 ? '' : 's' }}
    </p>
    <ol v-if="pinnedRow" class="lb pinned">
      <li class="lb-row me">
        <span class="rank">{{ pinnedRow.rank }}</span>
        <Avatar :name="pinnedRow.name" :id="pinnedRow.id ?? pinnedRow.name" :size="32" class="av" />
        <span class="who">
          <span class="nm">{{ pinnedRow.name }}<span class="you">You</span></span>
          <span v-if="pinnedRow.detail" class="dt">{{ pinnedRow.detail }}</span>
        </span>
        <span class="sc mono">{{ pinnedRow.score }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.lb-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.lb {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}
/* Two (or more) columns for the big screen: the winner keeps the full width, so the
   payoff still reads as the payoff, and the chasing pack fills the space beside it
   instead of running off the bottom of the screen. */
.lb.cols {
  display: grid;
  grid-template-columns: repeat(var(--lb-cols, 2), minmax(0, 1fr));
  gap: 8px 12px;
  align-items: start;
}
.lb.cols .lb-row.first {
  grid-column: 1 / -1;
}
.lb.cols {
  gap: 7px 12px;
}
.lb.cols .lb-row {
  padding: 6px 12px;
  gap: 10px;
}
.lb.cols .nm {
  font-size: 16px;
}
.lb.cols .sc {
  font-size: 18px;
}
.lb-rest {
  align-self: center;
  font-size: 13px;
  color: var(--ink-soft);
}
/* The viewer's own row, kept on the board below the cut. */
.lb.pinned {
  margin-top: 2px;
}
.you {
  display: inline-block;
  margin-left: 7px;
  vertical-align: 1px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary-ink);
  background: var(--primary);
  border-radius: 999px;
  padding: 1px 7px;
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 11px 14px;
}
/* The winner stands out: a brighter card, a gold star, a bigger avatar and name. */
.lb-row.first {
  border-color: var(--c1);
  background: color-mix(in srgb, var(--c1) 12%, var(--surface-2));
  box-shadow: var(--shadow-sm);
  padding: 14px;
  gap: 14px;
}
/* A co-leader in a tie: starred and tinted, but not blown up to hero size. */
.lb-row.crowned:not(.first) {
  border-color: color-mix(in srgb, var(--c1) 55%, var(--line-soft));
  background: color-mix(in srgb, var(--c1) 8%, var(--surface-2));
}
.lb-row.crowned:not(.first) .rank {
  color: var(--c1);
}
.lb-row.me {
  border-color: var(--primary);
}
.lb-row.first.me {
  border-color: var(--c1);
  box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--primary);
}
.rank {
  flex: none;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  width: 30px;
  text-align: center;
  color: var(--mute);
}
.lb-row.first .rank {
  color: var(--c1);
  font-size: 30px;
}
.av {
  flex: none;
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
/* Full names always show in full (wrapping onto a second line on a narrow phone)
   instead of being cut off with an ellipsis. */
.nm {
  font-weight: 800;
  font-size: 17px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.lb-row.first .nm {
  font-size: 20px;
}
.dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--mute);
}
.sc {
  flex: none;
  font-weight: 800;
  font-size: 20px;
  color: var(--c5);
}
.lb-row.first .sc {
  font-size: 26px;
}
</style>
