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
import { ConfettiBurst, Leaderboard, StatStrip, VoteBars, WinnerBoard, teamColor } from '@doot-games/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { distributionToBars } from './derive'
import { type Slide, distSlides, hasBars, isPodium, podiumEntries } from './slides'

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
const AWARDS_LABEL = 'Highlights'
// Plenty of games keep no score (a drawing gallery, a poll night, a round of quips).
// Their results page has no board and no breakdowns, and used to end on a headline
// over a void. Say plainly that there was nothing to score, so the ending reads as
// finished rather than as a page that failed to load.
const nothingToShow = computed(
  () => !hasTeams.value && !hasLeaderboard.value && !hasAwards.value && (props.results.distributions?.length ?? 0) === 0,
)

/**
 * The viewing player's own line on the board: where they placed, out of how many,
 * and what they scored. The room-level board answers "who won"; this answers "how
 * did I do", which is the question the player holding the phone actually has, and
 * which a top-8 list cannot answer for anybody outside the top 8. Null on the host
 * (nobody is "me"), and for a game that scored nothing.
 */
const myResult = computed(() => {
  const board = props.results.leaderboard ?? []
  if (!props.me || !board.length) return null
  const mine = board.find((e) => e.id === props.me || e.name === props.me)
  if (!mine) return null
  const scoreOf = (e: { score: number | string }) => (typeof e.score === 'number' ? e.score : 0)
  const score = scoreOf(mine)
  const top = Math.max(...board.map(scoreOf))
  // Competition place, so everyone level shares one ("3rd" for both of a tie).
  const place = 1 + board.filter((o) => scoreOf(o) > score).length
  const sharedWith = board.filter((o) => scoreOf(o) === score).length - 1
  // Nobody scored, so nobody placed: the headline deliberately refuses to crown a
  // winner at zero (see `crownHeadline`), and telling all 26 players they came 1st
  // would be the same lie told 26 times.
  const ranked = top > 0
  return { ...mine, score, place, of: board.length, sharedWith, ranked }
})
/** "1st", "2nd", "3rd", "11th"... */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}
// The awards panel was titled "Top rated", which is the rate block's own copy; rank and
// tier put cards here too (a room's #1, a crowned tier), so a rank-only game read as
// "Top rated". One neutral heading everywhere, matching the name the editor's results-
// order list uses; each card still says what it is ("Top rated Overall", "#1").
// A deleted upload must not leave a broken-image glyph on the big screen.
const brokenAwards = ref(new Set<string>())
function markAwardBroken(src?: string) {
  if (!src) return
  const next = new Set(brokenAwards.value)
  next.add(src)
  brokenAwards.value = next
}
const awardImage = (src?: string) => (src && !brokenAwards.value.has(src) ? src : '')

// Colour a team by its index in the lobby team list (passed in), so the results
// board matches the lobby roster colours. Falls back to its rank if unknown.
function teamTint(team: string, rank: number): string {
  const i = props.teams.indexOf(team)
  return teamColor(i >= 0 ? i : rank)
}
const topTeamScore = computed(() => props.results.teamLeaderboard?.[0]?.score ?? 0)

// One page per major section, in narration order: standings first (the payoff),
// then highlights, then per-question breakdowns. Stats are NOT a page; they stay
// pinned at the bottom so the run's tally is always in view.
const rawSlides = computed<Slide[]>(() => {
  const out: Slide[] = []
  if (hasTeams.value) out.push({ kind: 'teams', label: 'Team scores' })
  if (hasLeaderboard.value) out.push({ kind: 'leaderboard', label: 'Leaderboard' })
  if (hasAwards.value) out.push({ kind: 'awards', label: AWARDS_LABEL })
  for (const d of props.results.distributions ?? []) out.push(...distSlides(d))
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

// Whether the section on screen has more below the fold. Only then is the fade at the
// bottom of the stage right: painted unconditionally it draws a page-coloured band
// across a short panel's own bottom border.
const stageEl = ref<HTMLElement | null>(null)
const slideOverflows = ref(false)
async function measureSlide() {
  await nextTick()
  const el = stageEl.value?.querySelector('.slide')
  slideOverflows.value = !!el && el.scrollHeight - el.clientHeight > 2
}
watch(
  () => [current.value, props.results] as const,
  () => {
    void measureSlide()
  },
)

function go(delta: number) {
  const n = slides.value.length
  if (n === 0) return
  current.value = (current.value + delta + n) % n
}
function goTo(i: number) {
  if (i >= 0 && i < slides.value.length) current.value = i
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
  void measureSlide()
  if (!props.compact && typeof window !== 'undefined' && 'ResizeObserver' in window) {
    // A theme swap or a late-loading award image changes the height under us.
    observer = new ResizeObserver(() => {
      void measureSlide()
    })
    if (stageEl.value) observer.observe(stageEl.value)
  }
})
let observer: ResizeObserver | null = null
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  observer?.disconnect()
})
</script>

<template>
  <div class="results" :class="compact ? 'compact' : 'carousel'">
    <ConfettiBurst v-if="showConfetti" />
    <header class="rhead">
      <div class="kicker">That is a wrap</div>
      <h1>{{ results.headline }}</h1>
    </header>

    <!-- Phone: the same sections in the same order as the big screen, stacked, with
         the page scrolling. Driven by `slides` rather than a hardcoded template order,
         so an author who says "open on Highlights" gets that on every surface instead
         of only on the host's. -->
    <div v-if="compact" class="rgrid">
      <!-- The one thing this player came here to find out, before the room's board. -->
      <section v-if="myResult" class="panel mine" :class="{ won: myResult.place === 1 }">
        <p class="mine-kicker mono">Your result</p>
        <p v-if="myResult.ranked" class="mine-place">
          <span class="mine-ord">{{ ordinal(myResult.place) }}</span>
          <span class="mine-of">of {{ myResult.of }}</span>
        </p>
        <p v-else class="mine-place">
          <span class="mine-ord none">No score</span>
        </p>
        <!-- The board's own words for this player's line ("2 / 3", "4 votes",
             "$1200 bankroll"): blocks score in their own units, so the card repeats
             what the board says rather than asserting a unit of its own. -->
        <p v-if="myResult.detail" class="mine-detail strong">{{ myResult.detail }}</p>
        <p v-else-if="myResult.ranked" class="mine-detail strong">
          {{ myResult.score }} {{ myResult.score === 1 ? 'point' : 'points' }}
        </p>
        <p v-if="myResult.ranked && myResult.sharedWith > 0" class="mine-detail">
          Tied with {{ myResult.sharedWith }} other player{{ myResult.sharedWith === 1 ? '' : 's' }}.
        </p>
        <p v-if="!myResult.ranked" class="mine-detail">Nobody scored in this one.</p>
      </section>
      <template v-for="(s, si) in slides" :key="si">
        <section v-if="s.kind === 'teams'" class="panel board">
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

        <section v-else-if="s.kind === 'leaderboard'" class="panel board">
          <h3>Leaderboard</h3>
          <Leaderboard
            :entries="results.leaderboard ?? []"
            :highlight="me"
            :max="8"
            show-rest
            pin-highlighted
          />
        </section>

        <section v-else-if="s.kind === 'awards'" class="panel awards">
          <h3>{{ AWARDS_LABEL }}</h3>
          <div v-for="(a, i) in results.awards" :key="i" class="award">
            <img v-if="awardImage(a.image)" class="award-img" :src="awardImage(a.image)" alt="" @error="markAwardBroken(a.image)" />
            <div class="award-text">
              <div class="al">{{ a.label }}</div>
              <div class="as">{{ a.subject }}</div>
            </div>
            <div v-if="a.value != null" class="av">{{ a.value }}</div>
          </div>
        </section>

        <section v-else-if="s.kind === 'dist'" class="panel dist">
          <!-- The slide's label, not the raw title: a long podium is split across
               several sections and they must not all claim the same heading. -->
          <h3>{{ s.label }}</h3>
          <p v-if="!hasBars(s.dist)" class="nothing">Nothing to show for this one.</p>
          <WinnerBoard
            v-else-if="isPodium(s.dist)"
            :entries="podiumEntries(s.dist)"
            :crown="s.crown"
            compact
          />
          <VoteBars v-else :bars="distributionToBars(s.dist)" />
        </section>
      </template>

      <p v-if="nothingToShow" class="nothing">
        No scores in this one, just the run itself.
      </p>
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
          <div id="results-section-title" class="cpill" aria-live="polite" aria-atomic="true">
            <span class="cpill-label">{{ currentLabel }}</span>
            <span v-if="slides.length > 1" class="cpos">{{ current + 1 }} / {{ slides.length }}</span>
          </div>
          <!-- Jump straight to a section. A long quiz is one breakdown per question,
               and stepping to question 17 with the arrows is 17 presses; the dots make
               every section one click, and show at a glance how many there are. -->
          <nav v-if="slides.length > 1" class="cdots" aria-label="Results sections">
            <button
              v-for="(s, i) in slides"
              :key="i"
              type="button"
              class="cdot"
              :class="{ on: i === current }"
              :aria-current="i === current ? 'true' : undefined"
              :aria-label="`${s.label} (${i + 1} of ${slides.length})`"
              @click="goTo(i)"
            />
          </nav>
          <div ref="stageEl" class="cstage" :class="{ more: slideOverflows }">
            <!-- A cross-fade, deliberately NOT `mode="out-in"`: that mode runs a
                 leave-then-enter state machine, and a host paging fast (holding the
                 arrow key, or clicking along the dots) could leave it wedged showing
                 the previous section under the new section's title. Both slides share
                 one grid cell instead, so which section is on screen never depends on
                 a transition completing. -->
            <Transition name="slide">
              <section
                :key="current"
                class="panel slide"
                role="group"
                aria-labelledby="results-section-title"
              >
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
                  :max="8"
                  :columns="2"
                  show-rest
                />
                <div v-else-if="currentKind === 'awards'" class="award-grid">
                  <div v-for="(a, i) in results.awards" :key="i" class="award host">
                    <img v-if="awardImage(a.image)" class="award-img" :src="awardImage(a.image)" alt="" @error="markAwardBroken(a.image)" />
                    <div class="award-text">
                      <div class="al">{{ a.label }}</div>
                      <div class="as">{{ a.subject }}</div>
                    </div>
                    <div v-if="a.value != null" class="av">{{ a.value }}</div>
                  </div>
                </div>
                <p v-else-if="currentDist && !hasBars(currentDist)" class="nothing">
                  Nothing to show for this one.
                </p>
                <WinnerBoard
                  v-else-if="currentDist && isPodium(currentDist)"
                  :entries="podiumEntries(currentDist)"
                  :crown="currentSlide?.kind === 'dist' && currentSlide.crown"
                />
                <VoteBars v-else-if="currentDist" :bars="distributionToBars(currentDist)" dense />
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
        <p class="nothing">No scores in this one, just the run itself.</p>
        <StatStrip v-if="hasStats" :stats="results.stats ?? []" />
      </div>
      <StatStrip v-else-if="hasStats" :stats="results.stats ?? []" class="cstats" compact />
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
   pushing the screen taller.

   The cap lives HERE, on the board itself, not on the wrapper each host happens to
   put it in: seven different hosts mount this component (GameHost plus six
   custom-flow games with their own results wrapper), and a fix applied to one of
   them ships broken on the other six. GameHost adds a tighter cap of its own because
   it also has to leave room for the host's controls underneath. */
.results.carousel {
  flex: 1;
  min-height: 0;
  max-height: calc(100dvh - 116px);
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
  overflow-wrap: anywhere;
}
/* Phone rules key off the `compact` PROP, not a viewport width: `compact` is what
   decides this is a phone surface, and a media query would style a landscape phone or
   a tablet as if it were the big screen. */
.results.compact .rhead h1 {
  font-size: clamp(26px, 7vw, 34px);
  /* Two lines here: the player's own result is the lead on a phone, and a four-line
     room headline pushed it off the first screen. */
  -webkit-line-clamp: 2;
}
.results.compact .kicker {
  font-size: 11px;
}
.rgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
  align-items: start;
  /* Sit above the confetti (z-index 50) so falling pieces never obscure the
     leaderboard names/scores; confetti still plays over the header + background. */
  position: relative;
  z-index: 60;
}
.board,
.awards,
.dist {
  padding: 22px;
}
/* "Your result": the player's own line, led with on the phone. Deliberately the
   loudest card on the page, because it is the one the reader is looking for. */
.mine {
  padding: 14px 20px;
  text-align: center;
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  border-color: color-mix(in srgb, var(--primary) 40%, var(--line-soft));
}
.mine.won {
  background: color-mix(in srgb, var(--c1) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--c1) 55%, var(--line-soft));
}
.mine-kicker {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.mine-place {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 9px;
  margin-top: 2px;
}
.mine-ord {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(34px, 11vw, 46px);
  line-height: 1.05;
}
.mine-of {
  font-size: 15px;
  color: var(--ink-soft);
}
.mine-ord.none {
  font-size: clamp(24px, 7vw, 32px);
  color: var(--ink-soft);
}
.mine-detail {
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-soft);
}
.mine-detail.strong {
  margin-top: 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.nothing {
  color: var(--ink-soft);
  text-align: center;
  padding: 18px 0;
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
  /* Above the confetti (z-index 50) so falling pieces never cover the board text. */
  position: relative;
  z-index: 60;
}
.cmain {
  /* Always the MIDDLE column. The side arrows are `v-if`'d away when there is only one
     section, and without an explicit placement the board then auto-placed into the
     narrow `auto` first column: every single-slide game (the custom-flow flagships all
     publish exactly one) rendered its board squeezed against the left edge with the
     rest of the screen empty. */
  grid-column: 2;
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
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
}
/* A section taller than the screen scrolls inside its own panel rather than growing
   the page (which would carry the paging arrows and the host's controls past the
   fold). This fades the last few pixels so a clipped row reads as "there is more"
   rather than as a broken layout. Painted on the STAGE, not on the scroller: a mask
   over a scrolling list forces the whole list to composite on every frame, which at
   party scale is enough to lock the tab up. */
/* Only when there IS more below, and in the panel's own colour: the fade sits over
   the bottom of the slide, so fading to the page background would paint a stripe
   across the panel and swallow its border. */
.cstage.more::after {
  content: '';
  position: absolute;
  /* Exactly the panel's width, so the hint sits ON the panel instead of painting a
     bar across the empty stage either side of it. */
  left: 50%;
  transform: translateX(-50%);
  width: min(900px, 100%);
  bottom: 0;
  height: 30px;
  pointer-events: none;
  border-radius: 0 0 var(--radius) var(--radius);
  background: linear-gradient(to bottom, transparent, var(--surface));
}
.slide {
  /* Both the leaving and the entering slide occupy this one cell, so the cross-fade
     needs no absolute positioning and no transition bookkeeping. */
  grid-area: 1 / 1;
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
/* A host driving the big screen from a keyboard needs to see where focus is; the UA
   ring on a surface-coloured circle is nearly invisible in several themes. */
.cside:focus-visible,
.cdot:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
.cdots {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0;
  margin: -8px 0;
}
/* The dot LOOKS 10px but is a 24px target: the visual is the content box (painted via
   background-clip) inside transparent padding, so it meets the minimum touch/pointer
   size without a row of chunky circles across the screen. */
.cdot {
  width: 24px;
  height: 24px;
  padding: 7px;
  border: none;
  background: var(--line);
  background-clip: content-box;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.12s, transform 0.12s;
}
.cdot:hover {
  background: color-mix(in srgb, var(--primary) 55%, var(--line));
  background-clip: content-box;
}
.cdot.on {
  background: var(--primary);
  background-clip: content-box;
  transform: scale(1.3);
}
@media (prefers-reduced-motion: reduce) {
  .cdot {
    transition: none;
  }
}
.cstats {
  flex: none;
}
.cempty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
/* Give the stat strip a definite width so its auto-fit grid lays the cards out in a
   horizontal row across the big screen, instead of collapsing to a narrow centered
   column (auto-fit + 1fr has no width to expand into when the grid item is centered). */
.cempty :deep(.statrow) {
  width: min(880px, 100%);
}
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.slide-enter-from {
  opacity: 0;
  transform: translateX(18px);
}
.slide-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}
/* The one leaving must not catch clicks meant for the one arriving. */
.slide-leave-active {
  pointer-events: none;
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
/* A host screen is WIDE and short. Stacked, two award cards already ran past the
   bottom of the slide (rate emits one per category, rank one per picture round, so two
   or more is the common shape, not the stress case), and the host could only reach the
   rest by scrolling a TV. Side by side they fit, and they wrap to a second row rather
   than shrinking below a readable width. */
.award-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 10px;
  align-content: start;
}
.award-grid .award.host {
  margin-bottom: 0;
}

/* On the big screen the top-rated picture is the payoff, so show it large. */
/* Sized so several cards fit a 720p big screen. At the old 160px a single award
   filled the slide and the second was clipped, which is the common shape: rate emits
   one card per category, rank one per picture round. */
.award.host {
  padding: 12px 16px;
  margin-bottom: 10px;
}
.award.host .award-img {
  width: clamp(72px, 7vw, 96px);
  height: clamp(72px, 7vw, 96px);
  border-radius: 12px;
}
.award.host .al {
  font-size: 12px;
}
.award.host .as {
  font-size: 22px;
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
/* An award's value is usually a short number, but some blocks put PLAYER TEXT here
   (survey's top answer), so it needs the same wrapping and shrink permission as the
   subject beside it or one long word pushes the card off the screen. */
.av {
  flex: none;
  max-width: 40%;
  min-width: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  color: var(--c2);
  overflow-wrap: anywhere;
  text-align: right;
}
</style>
