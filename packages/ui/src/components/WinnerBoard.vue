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
  }>(),
  { compact: false, kicker: "The room's #1", highlightId: null },
)

const winner = computed<WinnerEntry | null>(() => props.entries[0] ?? null)
const rest = computed(() => props.entries.slice(1))

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
</script>

<template>
  <div v-if="winner" class="wb" :class="{ compact }">
    <!-- The winner: the payoff, so it gets the picture and the size. -->
    <div class="wb-hero" :class="{ 'has-img': !!pictureOf(winner), mine: !!highlightId && winner.id === highlightId }">
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
    <ol v-if="rest.length" class="wb-rest">
      <li
        v-for="(e, i) in rest"
        :key="e.id ?? e.label"
        class="wb-row"
        :class="{ mine: !!highlightId && e.id === highlightId }"
      >
        <span class="wb-rank mono">{{ badge(e, i + 1) }}</span>
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
</template>

<style scoped>
.wb {
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
