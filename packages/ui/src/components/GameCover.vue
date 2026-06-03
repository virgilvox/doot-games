<script setup lang="ts">
/**
 * A theme-aware gradient cover for a game card (ported from doot-mockup.html's
 * `.cover` + `motifSVG`). No images needed: a gradient between two theme accent
 * colors, a white line motif chosen by game type, a big faded initial, and an
 * optional "N live" badge. Colors come from theme CSS variables, so covers
 * restyle with the active theme.
 */
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** Game type / plugin id, selects the motif. */
    type?: string
    /** Live-room count; shows a pulsing badge when > 0. */
    live?: number
    /** Cover height in px (default 150); the featured hero uses a taller value. */
    height?: number
    /** Optional uploaded cover image. When set (and it loads), it fills the cover
     *  instead of the generated gradient art; a broken URL falls back to the art. */
    image?: string | null
  }>(),
  { type: '', live: 0, height: 150, image: null },
)

// Show the uploaded image only if it actually loads; otherwise keep the
// generated gradient art so a dead URL never leaves an empty box.
const imageFailed = ref(false)
// A reused card instance can get a new image (e.g. filtered lists); clear the
// failed flag so the new URL gets a fair chance to load.
watch(
  () => props.image,
  () => {
    imageFailed.value = false
  },
)
const showImage = computed(() => !!props.image && !imageFailed.value)

const ACCENTS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--primary']
function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Each "Game From Doot" gets an intentional palette + a bespoke motif so it's
// instantly recognizable on a card. Community/base-type cards keep the
// title-hashed gradient for variety. Colors are theme vars, so covers restyle
// with the active theme.
const FLAGSHIP: Record<string, { from: string; to: string; motif: string }> = {
  'quip-clash': { from: '--primary', to: '--c4', motif: 'bubbles' },
  'mad-libs': { from: '--c4', to: '--c3', motif: 'blanks' },
  'split-room': { from: '--c1', to: '--c5', motif: 'split' },
  'fib-finder': { from: '--c2', to: '--c1', motif: 'truth' },
  'sketch-spot': { from: '--c3', to: '--c2', motif: 'sketch' },
  'circuit-cypher': { from: '--c5', to: '--primary', motif: 'cypher' },
  'what-you-didnt-know': { from: '--c1', to: '--c4', motif: 'buzzer' },
  backronym: { from: '--c3', to: '--c5', motif: 'acronym' },
  'open-mic': { from: '--c5', to: '--c2', motif: 'mic' },
  hivemind: { from: '--c2', to: '--c4', motif: 'hive' },
  'most-likely': { from: '--primary', to: '--c2', motif: 'crowd' },
  ballpark: { from: '--c3', to: '--c1', motif: 'dial' },
  faker: { from: '--c5', to: '--c1', motif: 'mask' },
  'truth-or-share': { from: '--c4', to: '--c5', motif: 'spotlight' },
  'quiz-or-die': { from: '--c1', to: '--c5', motif: 'skull' },
}

// A flagship's curated gradient, else a stable, well-separated accent pair per title.
const grad = computed(() => {
  const f = FLAGSHIP[props.type]
  if (f) return `linear-gradient(135deg, var(${f.from}), var(${f.to}))`
  const h = hash(props.title || 'doot')
  const a = h % ACCENTS.length
  const b = (a + 2 + (h % 3)) % ACCENTS.length
  return `linear-gradient(135deg, var(${ACCENTS[a]}), var(${ACCENTS[b === a ? (b + 1) % ACCENTS.length : b]}))`
})

const motif = computed(() => {
  const f = FLAGSHIP[props.type]
  if (f) return f.motif
  const t = props.type
  if (t === 'guess') return 'q'
  if (t === 'rate' || t === 'votebox') return 'star'
  if (t === 'draw') return 'squiggle'
  if (t === 'poll') return 'bars'
  if (t === 'rank') return 'rank'
  if (t === 'buzzer') return 'buzzer'
  return 'grid'
})
const initial = computed(() => (props.title || '?').charAt(0).toUpperCase())
const S = 'rgba(255,255,255,.85)'
const SF = 'rgba(255,255,255,.32)'
</script>

<template>
  <div class="cover" :style="{ background: grad, height: `${height}px` }">
    <img v-if="showImage" class="cover-img" :src="image!" alt="" @error="imageFailed = true" />
    <svg v-if="!showImage" class="motif" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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

      <!-- Quiz or Die: a skull flanked by a question mark, the deadly quiz. -->
      <template v-else-if="motif === 'skull'">
        <path d="M118 44c0-22 18-34 32-34s32 12 32 34c0 14-6 20-6 30 0 6-4 8-10 8h-32c-6 0-10-2-10-8 0-10-6-16-6-30z" :fill="SF" />
        <circle cx="138" cy="52" r="9" :fill="S" />
        <circle cx="162" cy="52" r="9" :fill="S" />
        <path d="M146 66 l4 8 4-8z" :fill="S" />
        <rect x="138" y="92" width="5" height="14" rx="2" :fill="S" />
        <rect x="148" y="92" width="5" height="14" rx="2" :fill="S" />
        <rect x="158" y="92" width="5" height="14" rx="2" :fill="S" />
        <path d="M214 50c0-9 7-15 14-15s13 5 13 13c0 9-11 9-12 18" fill="none" :stroke="S" stroke-width="7" stroke-linecap="round" />
        <circle cx="229" cy="92" r="5" :fill="S" />
      </template>

      <!-- Quip Clash: two chat bubbles trading a quip. -->
      <template v-else-if="motif === 'bubbles'">
        <rect x="34" y="26" width="156" height="70" rx="20" :fill="SF" />
        <path d="M70 94 l-2 28 30 -26 z" :fill="SF" />
        <rect x="52" y="46" width="120" height="9" rx="4" :fill="S" />
        <rect x="52" y="66" width="78" height="9" rx="4" :fill="S" />
        <rect x="166" y="72" width="104" height="54" rx="16" fill="none" :stroke="S" stroke-width="6" />
        <rect x="184" y="90" width="62" height="8" rx="4" :fill="S" />
        <rect x="184" y="106" width="40" height="8" rx="4" :fill="S" />
      </template>

      <!-- Mad Libs: a paragraph with the blanks filled in (bright = a filled blank). -->
      <template v-else-if="motif === 'blanks'">
        <rect x="40" y="34" width="52" height="13" rx="5" :fill="SF" />
        <rect x="98" y="34" width="34" height="13" rx="5" :fill="S" />
        <rect x="138" y="34" width="58" height="13" rx="5" :fill="SF" />
        <rect x="202" y="34" width="40" height="13" rx="5" :fill="SF" />
        <rect x="40" y="58" width="40" height="13" rx="5" :fill="SF" />
        <rect x="86" y="58" width="70" height="13" rx="5" :fill="S" />
        <rect x="162" y="58" width="50" height="13" rx="5" :fill="SF" />
        <rect x="40" y="82" width="62" height="13" rx="5" :fill="SF" />
        <rect x="108" y="82" width="44" height="13" rx="5" :fill="S" />
        <rect x="158" y="82" width="48" height="13" rx="5" :fill="SF" />
        <rect x="40" y="106" width="50" height="13" rx="5" :fill="SF" />
        <rect x="96" y="106" width="40" height="13" rx="5" :fill="S" />
      </template>

      <!-- Split the Room: a room split down the middle, two sides pulling apart. -->
      <template v-else-if="motif === 'split'">
        <rect x="18" y="26" width="118" height="98" rx="12" :fill="SF" />
        <rect x="164" y="26" width="118" height="98" rx="12" fill="none" :stroke="S" stroke-width="5" />
        <line x1="150" y1="12" x2="150" y2="138" :stroke="S" stroke-width="6" stroke-linecap="round" />
        <path d="M104 75 l-30 0 m12 -12 l-14 12 14 12" fill="none" :stroke="S" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M196 75 l30 0 m-12 -12 l14 12 -14 12" fill="none" :stroke="S" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
      </template>

      <!-- Fib Finder: a magnifying glass inspecting the truth (a checked card). -->
      <template v-else-if="motif === 'truth'">
        <rect x="150" y="34" width="58" height="72" rx="10" fill="none" :stroke="SF" stroke-width="5" />
        <rect x="46" y="44" width="62" height="74" rx="10" :fill="SF" />
        <path d="M60 82 l13 13 24 -30" fill="none" :stroke="S" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="194" cy="84" r="34" fill="none" :stroke="S" stroke-width="9" />
        <line x1="218" y1="108" x2="244" y2="134" :stroke="S" stroke-width="11" stroke-linecap="round" />
      </template>

      <!-- Sketch & Spot: a framed doodle (the gallery the room votes on). -->
      <template v-else-if="motif === 'sketch'">
        <rect x="44" y="26" width="178" height="100" rx="12" fill="none" :stroke="S" stroke-width="6" />
        <path d="M64 102 Q92 50 122 86 T182 70" fill="none" :stroke="SF" stroke-width="9" stroke-linecap="round" />
        <circle cx="182" cy="70" r="8" :fill="SF" />
        <circle cx="70" cy="46" r="6" :fill="SF" />
        <line x1="232" y1="34" x2="262" y2="64" :stroke="S" stroke-width="9" stroke-linecap="round" />
        <path d="M258 60 l10 10 -3 -14 z" :fill="S" />
      </template>

      <!-- Circuit Cypher: a mic flanked by an equalizer (the rap battle). -->
      <template v-else-if="motif === 'cypher'">
        <rect v-for="(hgt, i) in [34, 58, 80]" :key="`l${i}`" :x="22 + i * 22" :y="108 - hgt" width="14" :height="hgt" rx="5" :fill="SF" />
        <rect v-for="(hgt, i) in [80, 58, 34]" :key="`r${i}`" :x="220 + i * 22" :y="108 - hgt" width="14" :height="hgt" rx="5" :fill="SF" />
        <circle cx="150" cy="52" r="22" :fill="S" />
        <circle cx="150" cy="52" r="11" :fill="SF" />
        <path d="M124 52 a26 26 0 0 0 52 0" fill="none" :stroke="S" stroke-width="6" stroke-linecap="round" />
        <line x1="150" y1="78" x2="150" y2="100" :stroke="S" stroke-width="7" stroke-linecap="round" />
        <rect x="128" y="100" width="44" height="9" rx="4" :fill="S" />
      </template>

      <!-- What, You Didn't Know That?: a game-show buzzer under the lights. -->
      <template v-else-if="motif === 'buzzer'">
        <line v-for="a in 7" :key="`ray${a}`" :x1="150 + (a - 4) * 12" y1="6" :x2="150 + (a - 4) * 30" y2="34" :stroke="SF" stroke-width="4" stroke-linecap="round" />
        <path d="M98 108 a52 46 0 0 1 104 0 z" :fill="S" />
        <ellipse cx="150" cy="92" rx="34" ry="9" :fill="SF" />
        <rect x="88" y="108" width="124" height="18" rx="8" :fill="SF" />
      </template>

      <!-- Backronym: three initials (tiles) expanding into a phrase (lines). -->
      <template v-else-if="motif === 'acronym'">
        <rect x="40" y="28" width="40" height="40" rx="9" :fill="SF" />
        <rect x="92" y="28" width="40" height="40" rx="9" :fill="SF" />
        <rect x="144" y="28" width="40" height="40" rx="9" :fill="SF" />
        <rect x="52" y="42" width="16" height="12" rx="3" :fill="S" />
        <rect x="104" y="42" width="16" height="12" rx="3" :fill="S" />
        <rect x="156" y="42" width="16" height="12" rx="3" :fill="S" />
        <rect x="40" y="84" width="155" height="12" rx="5" :fill="S" />
        <rect x="40" y="106" width="205" height="12" rx="5" :fill="SF" />
      </template>

      <!-- Open Mic: a microphone between two sound arcs. -->
      <template v-else-if="motif === 'mic'">
        <rect x="138" y="30" width="24" height="48" rx="12" :fill="S" />
        <path d="M124 66 a26 26 0 0 0 52 0" fill="none" :stroke="S" stroke-width="6" stroke-linecap="round" />
        <line x1="150" y1="92" x2="150" y2="112" :stroke="S" stroke-width="6" stroke-linecap="round" />
        <line x1="132" y1="114" x2="168" y2="114" :stroke="S" stroke-width="6" stroke-linecap="round" />
        <path d="M100 46 a40 40 0 0 0 0 56" fill="none" :stroke="SF" stroke-width="5" stroke-linecap="round" />
        <path d="M200 46 a40 40 0 0 1 0 56" fill="none" :stroke="SF" stroke-width="5" stroke-linecap="round" />
      </template>

      <!-- Hivemind: a honeycomb flower, the crowd as one mind (center bright). -->
      <template v-else-if="motif === 'hive'">
        <path d="M132 70 L141 54 L159 54 L168 70 L159 86 L141 86 Z" :fill="S" />
        <path d="M105 54 L114 38 L132 38 L141 54 L132 70 L114 70 Z" :fill="SF" />
        <path d="M159 54 L168 38 L186 38 L195 54 L186 70 L168 70 Z" :fill="SF" />
        <path d="M105 86 L114 70 L132 70 L141 86 L132 102 L114 102 Z" :fill="SF" />
        <path d="M159 86 L168 70 L186 70 L195 86 L186 102 L168 102 Z" :fill="SF" />
        <path d="M132 38 L141 22 L159 22 L168 38 L159 54 L141 54 Z" :fill="SF" />
        <path d="M132 102 L141 86 L159 86 L168 102 L159 118 L141 118 Z" :fill="SF" />
      </template>

      <!-- Most Likely To: three people, the room's pick bright and crowned. -->
      <template v-else-if="motif === 'crowd'">
        <circle cx="96" cy="60" r="13" :fill="SF" />
        <path d="M74 106 a22 20 0 0 1 44 0 Z" :fill="SF" />
        <circle cx="204" cy="60" r="13" :fill="SF" />
        <path d="M182 106 a22 20 0 0 1 44 0 Z" :fill="SF" />
        <circle cx="150" cy="58" r="17" :fill="S" />
        <path d="M120 114 a30 26 0 0 1 60 0 Z" :fill="S" />
        <path d="M131 38 L137 25 L143.5 33 L150 22 L156.5 33 L163 25 L169 38 Z" :fill="S" />
      </template>

      <!-- Ballpark: a gauge with the needle pointing near the answer. -->
      <template v-else-if="motif === 'dial'">
        <path d="M62 104 A88 88 0 0 1 238 104" fill="none" :stroke="SF" stroke-width="8" stroke-linecap="round" />
        <line x1="150" y1="16" x2="150" y2="28" :stroke="SF" stroke-width="5" stroke-linecap="round" />
        <line x1="80" y1="58" x2="89" y2="66" :stroke="SF" stroke-width="5" stroke-linecap="round" />
        <line x1="220" y1="58" x2="211" y2="66" :stroke="SF" stroke-width="5" stroke-linecap="round" />
        <line x1="150" y1="104" x2="196" y2="52" :stroke="S" stroke-width="8" stroke-linecap="round" />
        <circle cx="150" cy="104" r="10" :fill="S" />
        <circle cx="199" cy="47" r="7" :fill="S" />
      </template>

      <!-- Faker: a bandit's mask, one player bluffing behind it. -->
      <template v-else-if="motif === 'mask'">
        <path fill-rule="evenodd" :fill="S" d="M58 56 Q150 40 242 56 Q250 90 210 96 Q176 100 152 86 Q150 85 148 86 Q124 100 90 96 Q50 90 58 56 Z M99 70 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0 Z M175 70 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0 Z" />
      </template>

      <!-- Truth or Share: a spotlight beam picking out the star on the spot. -->
      <template v-else-if="motif === 'spotlight'">
        <rect x="128" y="10" width="44" height="14" rx="5" :fill="S" />
        <path d="M132 24 L96 128 L204 128 L168 24 Z" :fill="SF" />
        <path d="M150 66 l8 24 25 1 -20 15 7 24 -20 -14 -20 14 7 -24 -20 -15 25 -1 z" :fill="S" />
      </template>

      <template v-else>
        <rect v-for="n in 15" :key="n" :x="46 + ((n - 1) % 5) * 44" :y="28 + Math.floor((n - 1) / 5) * 36" width="30" height="26" rx="6" :fill="(((n - 1) % 5) + Math.floor((n - 1) / 5)) % 3 === 0 ? S : SF" />
      </template>
    </svg>
    <span v-if="!showImage" class="ini" aria-hidden="true">{{ initial }}</span>
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
.cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
