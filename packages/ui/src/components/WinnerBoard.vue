<script setup lang="ts">
/**
 * WinnerBoard — an ordered result with the winner on top.
 *
 * The room's #1 leads as a large card (its picture when the author gave the item
 * one, else a bold type-only card), and EVERY other entry is listed below in
 * order, so nothing the room decided is hidden. A runner-up shows a small
 * thumbnail when it has a picture and reads fine without one, so a board where
 * only the winner has an image still looks deliberate.
 *
 * Used by the Rank block on all three surfaces (host big screen at the reveal,
 * the phone reveal, and the results page breakdown) and available to any block
 * whose bars ARE an ordering. Presentational, theme-token driven, SSR-safe.
 */
import { computed, ref } from 'vue'
import MediaFrame from './MediaFrame.vue'

interface WinnerEntry {
  /** Stable key; falls back to the label when absent. */
  id?: string
  label: string
  /** Optional picture for this entry. */
  image?: string
  /** The place badge, e.g. "#1". Defaults to the entry's 1-based position. */
  place?: string
  /** The entry's score, when it has one distinct from its place (e.g. "8.5"). */
  value?: string
  /** Small caption under the label, e.g. "avg 1.4". */
  note?: string
}

const props = withDefaults(
  defineProps<{
    entries: WinnerEntry[]
    /** Phone layout: smaller hero, tighter rows. */
    compact?: boolean
    /** Kicker above the winner, e.g. "The room's #1". Empty hides it. */
    kicker?: string
    /** Highlight one entry (the viewer's own top pick) in the list. */
    highlightId?: string | null
    /**
     * Crown the first entry as THE winner (the hero card and its kicker). Turn it off
     * when the top place is SHARED: the first entry is then just whichever of the tied
     * items sorted first, and presenting it as "the room's #1" invents a result the
     * room did not produce, while the row below carries the same place badge.
     */
    crown?: boolean
  }>(),
  { compact: false, kicker: "The room's #1", highlightId: null, crown: true },
)

const winner = computed<WinnerEntry | null>(() => props.entries[0] ?? null)
/** Rows below the hero, or every row when there is no single winner to crown. */
const listed = computed(() => (props.crown ? props.entries.slice(1) : props.entries))

// A picture that 404s (a deleted upload, a hotlinked URL that died) must not leave
// a broken-image glyph on the big screen: drop it and fall back to type only.
const broken = ref(new Set<string>())
function markBroken(src: string) {
  const next = new Set(broken.value)
  next.add(src)
  broken.value = next
}
function pictureOf(e: WinnerEntry | null): string {
  const src = e?.image?.trim() ?? ''
  return src && !broken.value.has(src) ? src : ''
}
const badge = (e: WinnerEntry, i: number) => e.place ?? `#${i + 1}`
/**
 * Lay the winner and the rest SIDE BY SIDE on a big screen. Stacked, the board is the
 * hero (a picture plus display type) on top of the list, which is taller than the
 * results carousel's slide on a 720p host: the runners-up all landed below the fold and
 * the only way to read the room's ranking was to scroll a TV. A host screen is wide and
 * short, so the two halves sit next to each other and the whole order is on screen.
 * Only when there IS a hero and something to put beside it.
 */
const split = computed(() => !props.compact && props.crown && !!winner.value && listed.value.length > 0)
</script>

<template>
  <div v-if="winner" class="wb" :class="{ compact, split }">
    <!-- One inner box, because a container cannot query ITSELF: `.wb` is the size
         container and this is the box the query re-lays-out. -->
    <div class="wb-in">
    <!-- The winner: the payoff, so it gets the picture and the size. With a shared top
         place there is no winner, so every entry is listed level instead. -->
    <div
      v-if="crown"
      class="wb-hero"
      :class="{ 'has-img': !!pictureOf(winner), mine: !!highlightId && winner.id === highlightId }"
    >
      <MediaFrame
        v-if="pictureOf(winner)"
        class="wb-hero-img"
        :src="pictureOf(winner)"
        alt=""
        fit="contain"
        :max-h="compact ? '30vh' : 'min(26vh, 260px)'"
        @error="markBroken(pictureOf(winner))"
      />
      <div class="wb-hero-text">
        <p v-if="kicker" class="wb-kicker mono">{{ kicker }}</p>
        <p class="wb-place mono">{{ badge(winner, 0) }}</p>
        <!-- Not a heading: this sits INSIDE a section that already has one, and a
             second h3 there reads as a sibling section in the document outline. -->
        <p class="wb-name">{{ winner.label }}</p>
        <p v-if="winner.value" class="wb-value">{{ winner.value }}</p>
        <p v-if="winner.note" class="wb-note mono">{{ winner.note }}</p>
      </div>
    </div>

    <!-- Everything else, in order. Pictures are optional here on purpose. -->
    <ol v-if="listed.length" class="wb-rest">
      <li
        v-for="(e, i) in listed"
        :key="e.id ?? e.label"
        class="wb-row"
        :class="{ mine: !!highlightId && e.id === highlightId }"
      >
        <span class="wb-rank mono">{{ badge(e, crown ? i + 1 : i) }}</span>
        <img
          v-if="pictureOf(e)"
          class="wb-thumb"
          :src="pictureOf(e)"
          alt=""
          @error="markBroken(e.image ?? '')"
        />
        <span class="wb-label">{{ e.label }}</span>
        <span v-if="e.value" class="wb-rowvalue mono">{{ e.value }}</span>
        <span v-if="e.note" class="wb-rownote mono">{{ e.note }}</span>
      </li>
    </ol>
    </div>
  </div>
</template>

<style scoped>
.wb {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* The board renders both in a full-width results slide AND in the narrow right-hand
     column of the round stage, so "is there room for two columns" is a question about
     THIS element's width, not the viewport's. */
  container-type: inline-size;
}
.wb-in {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

/* ── The winner ───────────────────────────────────────────────────────── */
.wb-hero {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 18px 22px;
  background: color-mix(in srgb, var(--c2) 10%, var(--surface-2));
  border: var(--bd) solid color-mix(in srgb, var(--c2) 45%, var(--line-soft));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  min-width: 0;
  /* A new winner sliding in should not lurch; a short, soft entrance only. */
  animation: wb-rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.wb-hero:not(.has-img) {
  justify-content: center;
  text-align: center;
}
.wb-hero.mine {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent);
}
.wb-hero-img {
  flex: 0 1 auto;
  min-width: 0;
}
.wb-hero-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* The lines are `<p>`, so each carried the UA's `margin: 1em 0`, which SCALES with
   font-size: the 44px place badge alone added 88px. That inflated the hero to nearly
   400px on a 720p host, pushing the whole ranking off the results slide. `gap` above is
   the spacing this was always meant to have. */
.wb-hero-text > p {
  margin: 0;
}
.wb-kicker {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.wb-place {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(26px, 5vw, 44px);
  line-height: 1;
  color: var(--c2);
}
.wb-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 4.2vw, 40px);
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.wb-value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(16px, 2.4vw, 24px);
  color: var(--ink);
}
.wb-note {
  font-size: 13px;
  color: var(--ink-soft);
}

/* Wide enough for two columns: the winner on the left, the order beside it. Stacked,
   the board is a picture plus display type ON TOP OF the whole list, which is taller
   than the results carousel's slide on a 720p host: every runner-up landed below the
   fold and the only way to read the room's ranking was to scroll a TV. Below the
   threshold (the round stage's right-hand column) it stays stacked, where splitting
   would halve an already narrow column and wrap labels a character at a time. */
@container (min-width: 640px) {
  .wb.split .wb-in {
    flex-direction: row;
    align-items: start;
    gap: 16px;
  }
  .wb.split .wb-hero {
    flex: 0 1 auto;
    max-width: 52%;
  }
  .wb.split .wb-rest {
    flex: 1 1 0;
    min-width: 0;
    align-self: stretch;
  }
}

/* ── The rest of the order ────────────────────────────────────────────── */
.wb-rest {
  list-style: none;
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
.wb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  min-width: 0;
}
.wb-row.mine {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, var(--surface-2));
}
.wb-rank {
  flex: none;
  min-width: 2.6ch;
  font-weight: 800;
  color: var(--ink-soft);
}
.wb-thumb {
  flex: none;
  width: 38px;
  height: 38px;
  object-fit: cover;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
}
.wb-label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.wb-rowvalue {
  flex: none;
  font-weight: 800;
  color: var(--c2);
}
.wb-rownote {
  flex: none;
  font-size: 12px;
  color: var(--ink-soft);
}

/* ── Phone ────────────────────────────────────────────────────────────── */
.wb.compact .wb-hero {
  flex-direction: column;
  text-align: center;
  gap: 12px;
  padding: 14px 16px;
}
.wb.compact .wb-hero-text {
  align-items: center;
}
.wb.compact .wb-name {
  font-size: clamp(20px, 6vw, 28px);
}
.wb.compact .wb-thumb {
  width: 30px;
  height: 30px;
}

@keyframes wb-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wb-hero {
    animation: none;
  }
}
</style>
