<script setup lang="ts">
/**
 * Generic results page: renders whatever fragments the blocks contributed.
 *
 * On a phone (`compact`) the sections stack and the page scrolls. On the host
 * big screen there is no scroll, so the sections become a carousel: one section
 * at a time, paged by a tab bar / arrow keys, so a game with many breakdowns
 * still fits the screen instead of running off the bottom.
 */
import type { StandardResults } from '@doot-games/sdk'
import { ConfettiBurst, Leaderboard, StatStrip, VoteBars } from '@doot-games/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { distributionToBars } from './derive'

const props = withDefaults(
  defineProps<{ results: StandardResults; me?: string | null; compact?: boolean }>(),
  { me: null, compact: false },
)

const hasLeaderboard = computed(() => !!props.results.leaderboard && props.results.leaderboard.length > 0)
const hasAwards = computed(() => !!props.results.awards && props.results.awards.length > 0)
const hasStats = computed(() => !!props.results.stats && props.results.stats.length > 0)

type Distribution = NonNullable<StandardResults['distributions']>[number]
type Slide =
  | { kind: 'leaderboard'; label: string }
  | { kind: 'awards'; label: string }
  | { kind: 'dist'; label: string; dist: Distribution }
  | { kind: 'stats'; label: string }

// One slide per section, in narration order: standings first (the payoff), then
// highlights, then per-question breakdowns, then the run's tally.
const slides = computed<Slide[]>(() => {
  const out: Slide[] = []
  if (hasLeaderboard.value) out.push({ kind: 'leaderboard', label: 'Leaderboard' })
  if (hasAwards.value) out.push({ kind: 'awards', label: 'Top rated' })
  for (const d of props.results.distributions ?? []) out.push({ kind: 'dist', label: d.title ?? 'Breakdown', dist: d })
  if (hasStats.value) out.push({ kind: 'stats', label: 'By the numbers' })
  return out
})

const current = ref(0)
// Keep the index valid if results arrive/change after first render.
watch(slides, (s) => {
  if (current.value >= s.length) current.value = Math.max(0, s.length - 1)
})

const currentSlide = computed(() => slides.value[current.value] ?? null)
const currentKind = computed(() => currentSlide.value?.kind ?? null)
const currentDist = computed(() => (currentSlide.value?.kind === 'dist' ? currentSlide.value.dist : null))
const onLeaderboard = computed(() => currentKind.value === 'leaderboard')

function go(delta: number) {
  const n = slides.value.length
  if (n === 0) return
  current.value = (current.value + delta + n) % n
}
// The host often drives the big screen from a keyboard/remote: left/right page
// the carousel. Ignored on the phone (compact), where the page just scrolls.
function onKey(e: KeyboardEvent) {
  if (props.compact) return
  if (e.key === 'ArrowRight') go(1)
  else if (e.key === 'ArrowLeft') go(-1)
}
onMounted(() => {
  if (!props.compact) window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="results" :class="{ carousel: !compact }">
    <ConfettiBurst v-if="!compact && onLeaderboard" />
    <header class="rhead">
      <div class="kicker">That is a wrap</div>
      <h1>{{ results.headline }}</h1>
    </header>

    <!-- Phone: stacked, the page scrolls. -->
    <div v-if="compact" class="rgrid">
      <section v-if="hasLeaderboard" class="panel board">
        <h3>Leaderboard</h3>
        <Leaderboard :entries="results.leaderboard ?? []" :highlight="me" :max="6" />
      </section>

      <section v-if="hasAwards" class="panel awards">
        <h3>Top rated</h3>
        <div v-for="(a, i) in results.awards" :key="i" class="award">
          <div>
            <div class="al">{{ a.label }}</div>
            <div class="as">{{ a.subject }}</div>
          </div>
          <div v-if="a.value != null" class="av">{{ a.value }}</div>
        </div>
      </section>

      <section v-for="(d, i) in results.distributions ?? []" :key="`d${i}`" class="panel dist">
        <h3>{{ d.title }}</h3>
        <VoteBars :bars="distributionToBars(d)" />
      </section>
    </div>

    <!-- Host big screen: one section at a time so it always fits. -->
    <template v-else>
      <div class="cstage">
        <Transition name="slide" mode="out-in">
          <section :key="current" class="panel slide">
            <template v-if="currentKind === 'leaderboard'">
              <h3>Leaderboard</h3>
              <Leaderboard :entries="results.leaderboard ?? []" :highlight="me" :max="10" />
            </template>
            <template v-else-if="currentKind === 'awards'">
              <h3>Top rated</h3>
              <div v-for="(a, i) in results.awards" :key="i" class="award">
                <div>
                  <div class="al">{{ a.label }}</div>
                  <div class="as">{{ a.subject }}</div>
                </div>
                <div v-if="a.value != null" class="av">{{ a.value }}</div>
              </div>
            </template>
            <template v-else-if="currentDist">
              <h3>{{ currentDist.title }}</h3>
              <VoteBars :bars="distributionToBars(currentDist)" />
            </template>
            <template v-else-if="currentKind === 'stats'">
              <h3>By the numbers</h3>
              <StatStrip :stats="results.stats ?? []" />
            </template>
          </section>
        </Transition>
      </div>

      <nav v-if="slides.length > 1" class="cnav" aria-label="Results sections">
        <button type="button" class="cbtn" aria-label="Previous section" @click="go(-1)">&lsaquo;</button>
        <button
          v-for="(s, i) in slides"
          :key="i"
          type="button"
          class="ctab"
          :class="{ on: i === current }"
          :aria-current="i === current ? 'true' : undefined"
          @click="current = i"
        >
          {{ s.label }}
        </button>
        <button type="button" class="cbtn" aria-label="Next section" @click="go(1)">&rsaquo;</button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.results {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
/* Fill the host stage and never grow past it, so the carousel pages instead of
   pushing the screen taller. */
.results.carousel {
  flex: 1;
  min-height: 0;
}
.rhead {
  text-align: center;
}
.rhead h1 {
  font-size: clamp(32px, 7vw, 60px);
  font-weight: 800;
}
.rgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
  align-items: start;
}
.board,
.awards,
.dist {
  padding: 22px;
}

/* Carousel ---------------------------------------------------------------- */
.cstage {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
}
.slide {
  width: min(920px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 28px;
}
.slide h3 {
  text-align: center;
}
.cnav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ctab {
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  border-radius: 999px;
  padding: 9px 16px;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}
.ctab:hover {
  border-color: var(--line);
  color: var(--ink);
}
.ctab.on {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--line);
}
.cbtn {
  width: 44px;
  height: 44px;
  flex: none;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  border-radius: 50%;
  font-size: 24px;
  line-height: 1;
  font-weight: 800;
  color: var(--ink);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s;
}
.cbtn:hover {
  transform: translateY(-1px);
}
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.slide-enter-from {
  opacity: 0;
  transform: translateX(26px);
}
.slide-leave-to {
  opacity: 0;
  transform: translateX(-26px);
}
@media (prefers-reduced-motion: reduce) {
  .slide-enter-active,
  .slide-leave-active {
    transition: opacity 0.16s ease;
  }
  .slide-enter-from,
  .slide-leave-to {
    transform: none;
  }
}

.board h3,
.awards h3,
.dist h3 {
  font-size: 20px;
  margin-bottom: 14px;
  color: var(--primary);
}
.slide h3 {
  font-size: 24px;
  margin-bottom: 18px;
  color: var(--primary);
}
.award {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 12px 15px;
  margin-bottom: 9px;
}
.al {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 700;
}
.as {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
}
.av {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  color: var(--c2);
}
</style>
