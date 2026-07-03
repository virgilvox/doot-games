<script setup lang="ts">
/**
 * Doodle Chain results, with three ways to see a chain (Gartic-Phone style):
 *  - SLIDESHOW (host default): the reveal plays itself, one step at a time, with the
 *    drawing shown LARGE, so long chains never overflow the screen and you can
 *    actually see each doodle. Back / Play-Pause / Next, rolling from one chain into
 *    the next; arrow keys + space work too.
 *  - OVERVIEW: every chain as a filmstrip at a glance; click any drawing to enlarge.
 *  - ZOOM: click/tap any drawing (in either view, host or phone) to see it full size.
 * The phone shows the browsable overview and follows the shared big screen. Reads the
 * doodle block's `recap` (StandardResults.recap); no relay traffic, all local UI.
 */
import { DrawThumb } from '@doot-games/ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { StandardResults } from '@doot-games/sdk'
import type { DoodleRecap, DoodleStepView } from '../../blocks/doodle/block'
import { type DoodleSlide, flattenSlides, livingThreads, slideHoldMs, stepVerb } from './show'

const props = withDefaults(
  defineProps<{ results: StandardResults; me?: string | null; compact?: boolean; teams?: string[] }>(),
  { me: null, compact: false, teams: () => [] },
)

const recap = computed(() => (props.results?.recap as DoodleRecap | undefined) ?? { threads: [], aspect: 0.7 })
const threads = computed(() => livingThreads(recap.value.threads))
const slides = computed<DoodleSlide[]>(() => flattenSlides(recap.value.threads))
const aspect = computed(() => recap.value.aspect ?? 0.7)
const headline = computed(() => props.results?.headline ?? 'The chains are in')

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Phone browses the overview; the host runs the slideshow on the shared screen.
const mode = ref<'show' | 'grid'>(props.compact ? 'grid' : 'show')
const cursor = ref(0)
const playing = ref(!props.compact && !reducedMotion)
const zoom = ref<DoodleStepView | null>(null)

const current = computed(() => slides.value[cursor.value])
const atStart = computed(() => cursor.value <= 0)
const atEnd = computed(() => cursor.value >= slides.value.length - 1)

const isMe = (s: DoodleStepView) => !!props.me && s.name === props.me
const verb = (s: DoodleSlide) => stepVerb(s)

function next() {
  playing.value = false
  if (!atEnd.value) cursor.value++
}
function prev() {
  playing.value = false
  if (!atStart.value) cursor.value--
}
function togglePlay() {
  if (atEnd.value) {
    cursor.value = 0
    playing.value = true
  } else {
    playing.value = !playing.value
  }
}
function openZoom(s: DoodleStepView) {
  zoom.value = s
}
function closeZoom() {
  zoom.value = null
}

// Auto-advance: a self-rescheduling timer driven by (playing, cursor). Manual nav
// pauses it; the timer only advances the cursor, the watch reschedules.
let timer: ReturnType<typeof setTimeout> | null = null
function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
function schedule() {
  clearTimer()
  if (!playing.value || mode.value !== 'show') return
  const s = current.value
  if (!s) return
  if (atEnd.value) {
    playing.value = false
    return
  }
  timer = setTimeout(() => {
    cursor.value++
  }, slideHoldMs(s))
}
watch([playing, cursor, mode], schedule, { immediate: true })

function onKey(e: KeyboardEvent) {
  if (zoom.value && e.key === 'Escape') return closeZoom()
  if (mode.value !== 'show') return
  if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === ' ') {
    e.preventDefault()
    togglePlay()
  }
}
onMounted(() => {
  if (!props.compact) window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  clearTimer()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="unspool" :class="{ compact }">
    <div class="topbar">
      <h2 class="headline">{{ headline }}</h2>
      <div v-if="!compact && slides.length" class="viewtoggle" role="tablist" aria-label="View">
        <button role="tab" :aria-selected="mode === 'show'" :class="{ on: mode === 'show' }" @click="mode = 'show'">
          Slideshow
        </button>
        <button role="tab" :aria-selected="mode === 'grid'" :class="{ on: mode === 'grid' }" @click="mode = 'grid'">
          Overview
        </button>
      </div>
    </div>

    <p v-if="!threads.length" class="empty">No chains were finished this round.</p>

    <!-- SLIDESHOW (host) -->
    <section v-else-if="!compact && mode === 'show' && current" class="show" aria-live="polite">
      <div class="show-meta">
        <span class="chip">Chain {{ current.chainIndex + 1 }} of {{ current.chainCount }}</span>
        <span class="chip ghost">{{ current.stepIndex + 1 }} / {{ current.chainLen }}</span>
      </div>
      <div class="show-stage">
        <button
          v-if="current.step.mode === 'draw' && current.step.drawing"
          class="slide-draw"
          :class="{ self: isMe(current.step) }"
          :aria-label="`Enlarge ${current.step.name}'s drawing`"
          @click="openZoom(current.step)"
        >
          <DrawThumb :value="current.step.drawing" :aspect="aspect" :label="`${current.step.name}'s drawing`" />
        </button>
        <div v-else class="slide-text" :class="{ self: isMe(current.step) }">
          <p>{{ current.step.text || '...' }}</p>
        </div>
      </div>
      <div class="show-author"><b>{{ current.step.name }}</b> {{ verb(current) }}</div>
      <div class="show-dots" aria-hidden="true">
        <span v-for="i in current.chainLen" :key="i" class="dot" :class="{ on: i - 1 === current.stepIndex }" />
      </div>
      <div class="show-controls">
        <button class="ctl" :disabled="atStart" @click="prev">‹ Back</button>
        <button class="ctl primary" @click="togglePlay">{{ playing ? 'Pause' : atEnd ? 'Replay' : 'Play' }}</button>
        <button class="ctl" :disabled="atEnd" @click="next">Next ›</button>
      </div>
    </section>

    <!-- OVERVIEW grid (host toggle + phone default) -->
    <ol v-else class="threads">
      <li v-for="(thread, ti) in threads" :key="ti" class="chain">
        <div class="chain-head">Chain {{ ti + 1 }}</div>
        <ol class="steps">
          <li v-for="(s, si) in thread" :key="si" class="step" :class="{ self: isMe(s) }">
            <span class="who">{{ s.name }}</span>
            <button
              v-if="s.mode === 'draw' && s.drawing"
              class="thumbwrap"
              :aria-label="`Enlarge ${s.name}'s drawing`"
              @click="openZoom(s)"
            >
              <DrawThumb :value="s.drawing" :aspect="aspect" :label="`${s.name}'s drawing`" />
            </button>
            <span v-else class="text">{{ s.text || '...' }}</span>
          </li>
        </ol>
      </li>
    </ol>

    <!-- ZOOM lightbox (host + phone) -->
    <div v-if="zoom" class="zoom" @click="closeZoom">
      <div class="zoom-inner" @click.stop>
        <div class="zoom-who">{{ zoom.name }}</div>
        <DrawThumb v-if="zoom.drawing" :value="zoom.drawing" :aspect="aspect" :label="`${zoom.name}'s drawing`" />
        <p v-if="zoom.text" class="zoom-text">"{{ zoom.text }}"</p>
        <button class="zoom-close" @click="closeZoom">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unspool {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  position: relative;
}
.headline {
  margin: 0;
  text-align: center;
  font-size: clamp(24px, 5vw, 44px);
  font-weight: 900;
  color: var(--ink);
}
.viewtoggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
}
.viewtoggle button {
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-weight: 800;
  font-size: 14px;
  padding: 6px 16px;
  border-radius: 999px;
  cursor: pointer;
}
.viewtoggle button.on {
  background: var(--primary);
  color: var(--surface);
}
.empty {
  text-align: center;
  color: var(--ink-soft);
}

/* ── Slideshow ─────────────────────────────────────────────────────────────── */
.show {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.show-meta {
  display: flex;
  gap: 8px;
}
.chip {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 13px;
  color: var(--surface);
  background: var(--primary);
  padding: 5px 12px;
  border-radius: 999px;
}
.chip.ghost {
  color: var(--ink-soft);
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
}
.show-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: min(60vh, 640px);
}
.slide-draw {
  border: none;
  background: transparent;
  padding: 0;
  cursor: zoom-in;
  width: min(66vw, 640px);
  max-width: 100%;
  animation: pop 0.35s ease;
}
.slide-draw :deep(.draw-thumb) {
  width: 100%;
  height: auto;
  max-height: min(58vh, 600px);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.slide-draw.self :deep(.draw-thumb) {
  border-color: var(--primary);
}
.slide-text {
  max-width: 22ch;
  text-align: center;
  animation: pop 0.35s ease;
}
.slide-text p {
  margin: 0;
  font-size: clamp(30px, 6vw, 64px);
  font-weight: 900;
  line-height: 1.2;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.slide-text.self p {
  color: var(--primary);
}
.show-author {
  font-size: clamp(16px, 2.4vw, 22px);
  color: var(--ink-soft);
}
.show-author b {
  color: var(--ink);
}
.show-dots {
  display: flex;
  gap: 6px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--line);
}
.dot.on {
  background: var(--primary);
  transform: scale(1.25);
}
.show-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}
.ctl {
  border: var(--bd) solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 800;
  font-size: 15px;
  padding: 10px 18px;
  border-radius: 999px;
  cursor: pointer;
}
.ctl.primary {
  background: var(--primary);
  color: var(--surface);
  border-color: var(--primary);
}
.ctl:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .slide-draw,
  .slide-text {
    animation: none;
  }
}

/* ── Overview grid ─────────────────────────────────────────────────────────── */
.threads {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
}
.chain {
  border-radius: var(--radius);
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.chain-head {
  padding: 10px 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 13px;
  color: var(--surface);
  background: var(--primary);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 12px 14px;
  display: flex;
  gap: 12px;
}
/* Host overview: chains are horizontal filmstrips (bigger tiles, click to zoom). */
.unspool:not(.compact) .steps {
  flex-direction: row;
  flex-wrap: nowrap;
  overflow-x: auto;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 12px;
}
.unspool:not(.compact) .step {
  flex: 0 0 clamp(150px, 15vw, 220px);
}
/* Phone overview: chains stack vertically, drawings big enough to enjoy. */
.unspool.compact .steps {
  flex-direction: column;
}
.step {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.who {
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.text {
  font-size: clamp(15px, 2.2vw, 18px);
  font-weight: 600;
  line-height: 1.4;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.step.self .text {
  color: var(--primary);
}
.thumbwrap {
  border: none;
  background: transparent;
  padding: 0;
  cursor: zoom-in;
  width: 100%;
}
.thumbwrap :deep(.draw-thumb) {
  width: 100%;
  height: auto;
  border-radius: calc(var(--radius) - 4px);
  border: var(--bd) solid var(--line-soft);
  background: #fff;
}
.step.self .thumbwrap :deep(.draw-thumb) {
  border-color: var(--primary);
}

/* ── Zoom lightbox ─────────────────────────────────────────────────────────── */
.zoom {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, #000 62%, transparent);
  backdrop-filter: blur(2px);
}
.zoom-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: min(92vw, 900px);
}
.zoom-inner :deep(.draw-thumb) {
  width: min(84vw, 720px);
  height: auto;
  max-height: 78vh;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line);
  background: #fff;
  box-shadow: var(--shadow);
}
.zoom-who {
  font-weight: 800;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 14px;
}
.zoom-text {
  margin: 0;
  color: #fff;
  font-size: clamp(18px, 3vw, 26px);
  font-weight: 700;
  text-align: center;
}
.zoom-close {
  border: 2px solid #fff;
  background: transparent;
  color: #fff;
  font: inherit;
  font-weight: 800;
  padding: 8px 22px;
  border-radius: 999px;
  cursor: pointer;
}
</style>
