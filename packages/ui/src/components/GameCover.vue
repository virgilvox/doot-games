<script setup lang="ts">
/**
 * A theme-aware gradient cover for a game card (ported from doot-mockup.html's
 * `.cover` + `motifSVG`). No images needed: a gradient between two theme accent
 * colors, a white line motif chosen by game type, a big faded initial, and an
 * optional "N live" badge. Colors come from theme CSS variables, so covers
 * restyle with the active theme.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** Game type / plugin id, selects the motif. */
    type?: string
    /** Live-room count; shows a pulsing badge when > 0. */
    live?: number
    /** Cover height in px (default 150); the featured hero uses a taller value. */
    height?: number
  }>(),
  { type: '', live: 0, height: 150 },
)

const ACCENTS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--primary']
function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
// A stable, well-separated pair of accent vars per title.
const grad = computed(() => {
  const h = hash(props.title || 'doot')
  const a = h % ACCENTS.length
  const b = (a + 2 + (h % 3)) % ACCENTS.length
  return `linear-gradient(135deg, var(${ACCENTS[a]}), var(${ACCENTS[b === a ? (b + 1) % ACCENTS.length : b]}))`
})

const motif = computed(() => {
  const t = props.type
  if (t === 'guess') return 'q'
  if (t === 'rate' || t === 'votebox') return 'star'
  if (t === 'draw') return 'squiggle'
  if (t === 'poll') return 'bars'
  if (t === 'rank') return 'rank'
  if (t === 'quip-clash') return 'burst'
  return 'grid'
})
const initial = computed(() => (props.title || '?').charAt(0).toUpperCase())
const S = 'rgba(255,255,255,.85)'
const SF = 'rgba(255,255,255,.32)'
</script>

<template>
  <div class="cover" :style="{ background: grad, height: `${height}px` }">
    <svg class="motif" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <template v-if="motif === 'q'">
        <circle cx="150" cy="62" r="40" fill="none" :stroke="SF" stroke-width="10" />
        <path d="M138 56c0-9 7-15 14-15s13 5 13 13c0 9-11 9-12 18" fill="none" :stroke="S" stroke-width="8" stroke-linecap="round" />
        <circle cx="153" cy="92" r="5" :fill="S" />
      </template>
      <template v-else-if="motif === 'star'">
        <path d="M150 28 l8 24 25 1 -20 15 7 24 -20-14 -20 14 7-24 -20-15 25-1z" :fill="S" />
        <path d="M80 60 l5 15 16 1 -13 9 5 15 -13-9 -13 9 5-15 -13-9 16-1z" :fill="SF" />
        <path d="M220 60 l5 15 16 1 -13 9 5 15 -13-9 -13 9 5-15 -13-9 16-1z" :fill="SF" />
      </template>
      <template v-else-if="motif === 'squiggle'">
        <path d="M20 95 Q60 40 100 80 T180 80 T270 70" fill="none" :stroke="S" stroke-width="9" stroke-linecap="round" />
        <circle cx="270" cy="70" r="9" :fill="S" />
        <circle cx="40" cy="40" r="7" :fill="SF" />
      </template>
      <template v-else-if="motif === 'bars'">
        <rect x="48" y="82" width="30" height="40" rx="6" :fill="SF" />
        <rect x="92" y="50" width="30" height="72" rx="6" :fill="SF" />
        <rect x="136" y="68" width="30" height="54" rx="6" :fill="SF" />
        <rect x="180" y="32" width="30" height="90" rx="6" :fill="S" />
        <rect x="224" y="92" width="30" height="30" rx="6" :fill="SF" />
      </template>
      <template v-else-if="motif === 'rank'">
        <rect x="45" y="26" width="210" height="20" rx="7" :fill="S" />
        <rect x="45" y="54" width="170" height="20" rx="7" :fill="SF" />
        <rect x="45" y="82" width="130" height="20" rx="7" :fill="SF" />
        <rect x="45" y="110" width="90" height="20" rx="7" :fill="SF" />
      </template>
      <template v-else-if="motif === 'burst'">
        <line v-for="a in 10" :key="a" :x1="150 + Math.cos((a - 1) * 0.628) * 16" :y1="70 + Math.sin((a - 1) * 0.628) * 16" :x2="150 + Math.cos((a - 1) * 0.628) * 42" :y2="70 + Math.sin((a - 1) * 0.628) * 42" :stroke="a % 2 ? S : SF" stroke-width="7" stroke-linecap="round" />
        <circle cx="150" cy="70" r="14" :fill="S" />
      </template>
      <template v-else>
        <rect v-for="n in 15" :key="n" :x="46 + ((n - 1) % 5) * 44" :y="28 + Math.floor((n - 1) / 5) * 36" width="30" height="26" rx="6" :fill="(((n - 1) % 5) + Math.floor((n - 1) / 5)) % 3 === 0 ? S : SF" />
      </template>
    </svg>
    <span class="ini" aria-hidden="true">{{ initial }}</span>
    <span v-if="live > 0" class="live"><i />{{ live }} live</span>
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  overflow: hidden;
  border-bottom: var(--bd) solid var(--line);
}
.motif {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ini {
  position: absolute;
  right: -6px;
  bottom: -22px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 120px;
  color: rgba(255, 255, 255, 0.22);
  line-height: 1;
}
.live {
  position: absolute;
  top: 10px;
  left: 10px;
  background: var(--ink);
  color: var(--bg);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  padding: 4px 9px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.live i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c5);
  animation: blink 1.2s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
</style>
