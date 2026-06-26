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
import { ConfettiBurst, Leaderboard, StatStrip, VoteBars, teamColor } from '@doot-games/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { distributionToBars } from './derive'

const props = withDefaults(
  defineProps<{
    results: StandardResults
    me?: string | null
    compact?: boolean
    teams?: string[]
    /** Author-chosen section order for the results page; listed kinds lead, the rest
     *  follow in the default order. Lets a game open on its top-rated picture, say. */
    order?: Array<'teams' | 'leaderboard' | 'awards' | 'breakdowns'>
  }>(),
  { me: null, compact: false, teams: () => [], order: () => [] },
)

const hasLeaderboard = computed(() => !!props.results.leaderboard && props.results.leaderboard.length > 0)
const hasTeams = computed(() => !!props.results.teamLeaderboard && props.results.teamLeaderboard.length > 0)
const hasAwards = computed(() => !!props.results.awards && props.results.awards.length > 0)
const hasStats = computed(() => !!props.results.stats && props.results.stats.length > 0)

// Colour a team by its index in the lobby team list (passed in), so the results
// board matches the lobby roster colours. Falls back to its rank if unknown.
function teamTint(team: string, rank: number): string {
  const i = props.teams.indexOf(team)
  return teamColor(i >= 0 ? i : rank)
}
const topTeamScore = computed(() => props.results.teamLeaderboard?.[0]?.score ?? 0)

type Distribution = NonNullable<StandardResults['distributions']>[number]
type Slide =
  | { kind: 'teams'; label: string }
  | { kind: 'leaderboard'; label: string }
  | { kind: 'awards'; label: string }
  | { kind: 'dist'; label: string; dist: Distribution }

// One page per major section, in narration order: standings first (the payoff),
// then highlights, then per-question breakdowns. Stats are NOT a page; they stay
// pinned at the bottom so the run's tally is always in view.
const rawSlides = computed<Slide[]>(() => {
  const out: Slide[] = []
  if (hasTeams.value) out.push({ kind: 'teams', label: 'Team scores' })
  if (hasLeaderboard.value) out.push({ kind: 'leaderboard', label: 'Leaderboard' })
  if (hasAwards.value) out.push({ kind: 'awards', label: 'Top rated' })
  for (const d of props.results.distributions ?? [])
    out.push({ kind: 'dist', label: d.title ?? 'Breakdown', dist: d })
  return out
})
// Apply the author's chosen section order (which to lead with). Listed kinds come
// first in that order; anything not listed keeps the default order after them. A
// stable sort keeps multiple breakdowns in their authored order.
const sectionOf = (k: Slide['kind']) => (k === 'dist' ? 'breakdowns' : k)
const slides = computed<Slide[]>(() => {
  const order = props.order
  if (!order.length) return rawSlides.value
  const rank = (s: Slide) => {
    const i = order.indexOf(sectionOf(s.kind) as (typeof order)[number])
    return i === -1 ? order.length : i
  }
  return rawSlides.value
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map((x) => x.s)
})

const current = ref(0)
watch(slides, (s) => {
  if (current.value >= s.length) current.value = Math.max(0, s.length - 1)
})

const currentSlide = computed(() => slides.value[current.value] ?? null)
const currentKind = computed(() => currentSlide.value?.kind ?? null)
const currentDist = computed(() => (currentSlide.value?.kind === 'dist' ? currentSlide.value.dist : null))
const currentLabel = computed(() => currentSlide.value?.label ?? '')
// The "podium" payoff is the team board when teams are on, else the leaderboard.
const onPodium = computed(() => currentKind.value === 'teams' || currentKind.value === 'leaderboard')

// Burst the confetti ONCE, the first time a podium (team board / leaderboard) is
// shown. Latched so paging away and back does not replay it. Phones celebrate
// too (compact stacks every section, so the podium is "shown" on arrival when
// the game scored); ConfettiBurst honors prefers-reduced-motion itself.
const showConfetti = ref(false)
watch(
  () => onPodium.value || (props.compact && (hasTeams.value || hasLeaderboard.value)),
  (v) => {
    if (v) showConfetti.value = true
  },
  { immediate: true },
)

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
    <ConfettiBurst v-if="showConfetti" />
    <header class="rhead">
      <div class="kicker">That is a wrap</div>
      <h1>{{ results.headline }}</h1>
    </header>

    <!-- Phone: stacked, the page scrolls. -->
    <div v-if="compact" class="rgrid">
      <section v-if="hasTeams" class="panel board">
        <h3>Team scores</h3>
        <ol class="teamboard">
          <li
            v-for="(t, i) in results.teamLeaderboard"
            :key="t.team"
            class="team-row"
            :class="{ win: t.score === topTeamScore && t.score > 0 }"
            :style="{ '--team': teamTint(t.team, i) }"
          >
            <span class="team-rank mono">{{ i + 1 }}</span>
            <span class="team-dot" aria-hidden="true" />
            <span class="team-name">{{ t.team }}</span>
            <span class="team-meta">{{ t.members }} player{{ t.members === 1 ? '' : 's' }}</span>
            <span class="team-score mono">{{ t.score }}</span>
          </li>
        </ol>
      </section>

      <section v-if="hasLeaderboard" class="panel board">
        <h3>Leaderboard</h3>
        <Leaderboard :entries="results.leaderboard ?? []" :highlight="me" :max="8" />
      </section>

      <section v-if="hasAwards" class="panel awards">
        <h3>Top rated</h3>
        <div v-for="(a, i) in results.awards" :key="i" class="award">
          <img v-if="a.image" class="award-img" :src="a.image" alt="" />
          <div class="award-text">
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
          <div class="cpill" aria-live="polite" aria-atomic="true">
            <span class="cpill-label">{{ currentLabel }}</span>
            <span v-if="slides.length > 1" class="cpos">{{ current + 1 }} / {{ slides.length }}</span>
          </div>
          <div class="cstage">
            <Transition name="slide" mode="out-in">
              <section :key="current" class="panel slide">
                <ol v-if="currentKind === 'teams'" class="teamboard host">
                  <li
                    v-for="(t, i) in results.teamLeaderboard"
                    :key="t.team"
                    class="team-row"
                    :class="{ win: t.score === topTeamScore && t.score > 0 }"
                    :style="{ '--team': teamTint(t.team, i) }"
                  >
                    <span class="team-rank mono">{{ i + 1 }}</span>
                    <span class="team-dot" aria-hidden="true" />
                    <span class="team-name">{{ t.team }}</span>
                    <span class="team-meta">{{ t.members }} player{{ t.members === 1 ? '' : 's' }}</span>
                    <span class="team-score mono">{{ t.score }}</span>
                  </li>
                </ol>
                <Leaderboard
                  v-else-if="currentKind === 'leaderboard'"
                  :entries="results.leaderboard ?? []"
                  :highlight="me"
                  :max="10"
                />
                <template v-else-if="currentKind === 'awards'">
                  <div v-for="(a, i) in results.awards" :key="i" class="award host">
                    <img v-if="a.image" class="award-img" :src="a.image" alt="" />
                    <div class="award-text">
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

      <!-- A game with no scored sections (e.g. a plain Draw gallery) has only the
           run tally; center it so the stage is not a blank box. -->
      <div v-if="!slides.length" class="cempty">
        <StatStrip v-if="hasStats" :stats="results.stats ?? []" />
      </div>
      <StatStrip v-else-if="hasStats" :stats="results.stats ?? []" class="cstats" />
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
  /* Safety net: even after the tie headline caps its names, keep the title to a few
     lines so a long winner name can never push the carousel/board off the host screen. */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
/* Phone: use the width. Tighten panel padding so the names/scores get more room,
   and let the winner headline read large. */
@media (max-width: 560px) {
  .rgrid {
    gap: 14px;
  }
  .board,
  .awards,
  .dist {
    padding: 15px;
  }
  .rhead h1 {
    font-size: clamp(30px, 8vw, 40px);
  }
  .board h3,
  .awards h3,
  .dist h3 {
    margin-bottom: 10px;
  }
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
.cempty {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
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

/* Team board ------------------------------------------------------------- */
.teamboard {
  list-style: none;
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
}
.teamboard.host {
  width: min(720px, 100%);
}
.team-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-left: 4px solid var(--team);
  border-radius: 13px;
  padding: 12px 16px;
}
.team-row.win {
  background: color-mix(in srgb, var(--team) 14%, var(--surface-2));
  border-color: var(--team);
}
.team-rank {
  font-weight: 800;
  color: var(--ink-soft);
  font-size: 16px;
}
.team-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--team);
}
.team-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(18px, 2.4vw, 24px);
  overflow-wrap: anywhere;
}
.team-meta {
  font-size: 13px;
  color: var(--mute);
  font-weight: 600;
}
.team-score {
  font-weight: 800;
  font-size: clamp(20px, 2.6vw, 28px);
  color: var(--team);
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
.award-text {
  min-width: 0;
  flex: 1;
}
.award-img {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  border: var(--bd) solid var(--line-soft);
}
/* On the big screen the top-rated picture is the payoff, so show it large. */
.award.host {
  padding: 16px 18px;
  margin-bottom: 12px;
}
.award.host .award-img {
  width: clamp(96px, 12vw, 160px);
  height: clamp(96px, 12vw, 160px);
  border-radius: 14px;
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
  overflow-wrap: anywhere;
}
.av {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  color: var(--c2);
}
</style>
