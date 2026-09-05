<script setup lang="ts">
/** Animated value bars for rating averages and poll/choice distributions. */
import { ref } from 'vue'
interface Bar {
  label: string
  value: number
  /** Upper bound for the fill (e.g. the rating scale max, or the vote total). */
  max: number
  /** Lower bound for the fill, so a scale that starts above 0 fills from empty. */
  min?: number
  /** Override the shown value, e.g. a tier label "C" instead of the raw number. */
  display?: string
  /** Optional caption under the value, e.g. "12 ratings". */
  note?: string
  /** Optional picture for this entry (a rank/tier item's own image), shown as a small
   *  thumbnail beside the label so a picture-led round still reads as itself here. */
  image?: string
}
withDefaults(
  defineProps<{
    bars: Bar[]
    unit?: string
    /** Tighter rows for the host big screen, where the whole chart has to fit one
     *  screen: the caption moves up beside the label instead of taking its own line,
     *  and the value shrinks. Three options is the commonest breakdown there is and
     *  it did not fit at the roomy phone size. */
    dense?: boolean
  }>(),
  { unit: '', dense: false },
)
// A picture that 404s must not leave a broken-image glyph on the big screen.
const broken = ref(new Set<string>())
function markBroken(src: string) {
  const next = new Set(broken.value)
  next.add(src)
  broken.value = next
}
const thumb = (b: Bar) => (b.image && !broken.value.has(b.image) ? b.image : '')
const pct = (b: Bar) => {
  const min = b.min ?? 0
  const span = b.max - min
  return span > 0 ? Math.min(100, Math.max(0, ((b.value - min) / span) * 100)) : 0
}
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const shown = (b: Bar) => b.display ?? fmt(b.value)
</script>

<template>
  <div class="bars" :class="{ dense }">
    <div v-for="(b, i) in bars" :key="i" class="bar-row">
      <div class="btop">
        <img v-if="thumb(b)" class="bthumb" :src="thumb(b)" alt="" @error="markBroken(b.image ?? '')" />
        <span class="blabel">{{ b.label }}</span>
        <span v-if="dense && b.note" class="bnote inline mono">{{ b.note }}</span>
        <span class="bval">{{ shown(b) }}<small v-if="unit"> {{ unit }}</small></span>
      </div>
      <div class="track">
        <span class="fill" :style="{ width: `${pct(b)}%` }" />
      </div>
      <span v-if="!dense && b.note" class="bnote mono">{{ b.note }}</span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: grid;
  gap: 12px;
}
.bar-row {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.btop {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.bthumb {
  flex: none;
  align-self: center;
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
}
/* A bar label can be text a PLAYER wrote (a quip, a rap verse, a survey answer) with
   no length limit worth relying on, so it wraps and is clamped instead of pushing the
   value off the row. Three lines is enough to read a punchline. */
.blabel {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 14px;
}
.bval {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 30px;
  color: var(--c2);
  line-height: 1;
}
.bval small {
  font-size: 14px;
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-weight: 400;
}
.track {
  height: 14px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 2px solid var(--line-soft);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, var(--c2), color-mix(in srgb, var(--c2) 70%, transparent));
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}
.bnote {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-soft);
}
/* Inline caption. Blocks put very different things here: a short "82% agree", a
   player's name, and hivemind's whole round PROMPT (up to 400 characters), so it has
   to be allowed to shrink and truncate rather than shoving the label and the value
   out of the row. */
.bnote.inline {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  margin-top: 0;
  align-self: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Dense: one text row + the track. Saves roughly a third of each row's height, which
   is what lets a three- or four-option breakdown fit the big screen without a scroll. */
.bars.dense {
  gap: 9px;
}
.bars.dense .bar-row {
  padding: 9px 14px;
}
.bars.dense .bval {
  font-size: 24px;
}
.bars.dense .track {
  height: 12px;
  margin-top: 6px;
}
</style>
