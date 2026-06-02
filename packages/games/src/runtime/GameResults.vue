<script setup lang="ts">
/**
 * Generic results page: renders whatever fragments the blocks contributed.
 *
 * On a phone (`compact`) the sections stack and the page scrolls. On the host big
 * screen there is no scroll, so the sections become a carousel: arrows on each
 * side page one section at a time, the current section's title sits in a pill at
 * the top, and the run's stat strip is pinned at the bottom (always visible). The
 * leaderboard (the winners) is the first page when the game scores; poll/rank
 * games have no scored winner, so they open on the first breakdown.
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

// One page per major section, in narration order: standings first (the payoff),
// then highlights, then per-question breakdowns. Stats are NOT a page; they stay
// pinned at the bottom so the run's tally is always in view.
const slides = computed<Slide[]>(() => {
  const out: Slide[] = []
  if (hasLeaderboard.value) out.push({ kind: 'leaderboard', label: 'Leaderboard' })
  if (hasAwards.value) out.push({ kind: 'awards', label: 'Top rated' })
  for (const d of props.results.distributions ?? [])
    out.push({ kind: 'dist', label: d.title ?? 'Breakdown', dist: d })
  return out
})

const current = ref(0)
watch(slides, (s) => {
  if (current.value >= s.length) current.value = Math.max(0, s.length - 1)
})

const currentSlide = computed(() => slides.value[current.value] ?? null)
const currentKind = computed(() => currentSlide.value?.kind ?? null)
const currentDist = computed(() => (currentSlide.value?.kind === 'dist' ? currentSlide.value.dist : null))
const currentLabel = computed(() => currentSlide.value?.label ?? '')
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

      <StatStrip v-if="hasStats" :stats="results.stats ?? []" />
    </div>

    <!-- Host big screen: arrows on the sides, title pill on top, one section in
         view, stats pinned at the bottom so everything fits the screen. -->
    <template v-else>
      <div v-if="slides.length" class="ccarousel">
        <button
          v-if="slides.length > 1"
          type="button"
          class="cside"
          aria-label="Previous section"
          @click="go(-1)"
        >
          &lsaquo;
        </button>

        <div class="cmain">
          <div class="cpill">
            <span class="cpill-label">{{ currentLabel }}</span>
            <span v-if="slides.length > 1" class="cpos">{{ current + 1 }} / {{ slides.length }}</span>
          </div>
          <div class="cstage">
            <Transition name="slide" mode="out-in">
              <section :key="current" class="panel slide">
                <Leaderboard
                  v-if="currentKind === 'leaderboard'"
                  :entries="results.leaderboard ?? []"
                  :highlight="me"
                  :max="10"
                />
                <template v-else-if="currentKind === 'awards'">
                  <div v-for="(a, i) in results.awards" :key="i" class="award">
                    <div>
                      <div class="al">{{ a.label }}</div>
                      <div class="as">{{ a.subject }}</div>
                    </div>
                    <div v-if="a.value != null" class="av">{{ a.value }}</div>
                  </div>
                </template>
                <VoteBars v-else-if="currentDist" :bars="distributionToBars(currentDist)" />
              </section>
            </Transition>
          </div>
        </div>

        <button
          v-if="slides.length > 1"
          type="button"
          class="cside"
          aria-label="Next section"
          @click="go(1)"
        >
          &rsaquo;
        </button>
      </div>

      <StatStrip v-if="hasStats" :stats="results.stats ?? []" class="cstats" />
    </template>
  </div>
</template>

<style scoped>
.results {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  font-size: clamp(28px, 5vw, 48px);
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
.ccarousel {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.cmain {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cpill {
  align-self: center;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: color-mix(in srgb, var(--primary) 12%, var(--surface));
  border: var(--bd) solid color-mix(in srgb, var(--primary) 35%, var(--line));
  color: var(--primary);
  border-radius: 999px;
  padding: 8px 18px;
  font-weight: 800;
}
.cpill-label {
  /* A distribution's title is the question prompt, which can be long; keep the
     pill to two lines so it never grows the layout. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: center;
  line-height: 1.25;
}
.cpos {
  flex: none;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
  background: var(--surface);
  border-radius: 999px;
  padding: 2px 9px;
}
.cstage {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
}
.slide {
  width: min(900px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 24px 26px;
}
.cside {
  width: 56px;
  height: 56px;
  flex: none;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  border-radius: 50%;
  font-size: 30px;
  line-height: 1;
  font-weight: 800;
  color: var(--ink);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s, box-shadow 0.1s;
}
.cside:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}
.cstats {
  flex: none;
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
