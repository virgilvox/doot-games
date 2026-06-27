<script setup lang="ts">
/**
 * MediaFrame — the one primitive for a picture on a stage, in two honest modes.
 *
 *  - fit="contain" (default): the frame WRAPS the picture. The image is shown
 *    whole (never cropped) and the bordered card sizes to the image's rendered
 *    box, so a portrait/square picture in a wide slot leaves NO letterbox gaps.
 *    The card hugs the image because the border/background sit on the <img>
 *    itself, which self-sizes (auto width/height) under the width + `maxH` caps —
 *    the element box IS the picture. Centered in whatever column it sits in.
 *  - fit="cover": the frame is a fixed shape (its `ratio`, or the box the call
 *    site sizes) and the picture FILLS it, cropping the overflow. `focal` (0..1)
 *    picks which part stays in view (object-position), so the subject is kept.
 *    For fixed-shape slots: thumbnails, cards, banners.
 *
 * Keeping the sizing/cropping rules here means views stop re-deriving (and
 * re-bandaging) them. Purely presentational + SSR-safe (template + CSS only).
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    fit?: 'contain' | 'cover'
    /** cover mode: frame aspect ratio, e.g. '16 / 9' or 1.5 (width / height). */
    ratio?: string | number | null
    /** cover mode: focal point, each axis 0..1; defaults to center. */
    focal?: { x: number; y: number } | null
    /** contain mode: height cap (any CSS length). Ignored when `fill`. */
    maxH?: string
    /**
     * contain mode: grow the picture to FILL its box (scaling up small images),
     * instead of showing it at natural size capped by `maxH`. The <img> stays
     * the sizing element (height:100% + width:auto), so the bordered box still
     * hugs the picture — it fills AND has no letterbox gap. The box must have a
     * resolved height (the call site gives the frame `flex:1` / `align-self:
     * stretch` inside a height-bounded column).
     */
    fill?: boolean
    /** Draw the bordered, rounded card around the picture. */
    framed?: boolean
  }>(),
  {
    alt: '',
    fit: 'contain',
    ratio: null,
    focal: null,
    maxH: 'min(46vh, 460px)',
    fill: false,
    framed: true,
  },
)
const emit = defineEmits<{ error: [] }>()

// Clamp the focal point to the image and express it as object-position. A null
// focal is dead-center, which is exactly today's behavior for every saved image.
const objectPosition = computed(() => {
  const f = props.focal
  if (!f) return '50% 50%'
  const x = Math.min(100, Math.max(0, f.x * 100))
  const y = Math.min(100, Math.max(0, f.y * 100))
  return `${x}% ${y}%`
})
const ratioCss = computed(() =>
  props.ratio == null ? undefined : typeof props.ratio === 'number' ? String(props.ratio) : props.ratio,
)
</script>

<template>
  <div
    class="media-frame"
    :class="[fit === 'cover' ? 'is-cover' : 'is-contain', { framed, fill: fit !== 'cover' && fill }]"
    :style="
      fit === 'cover'
        ? { aspectRatio: ratioCss, '--mf-pos': objectPosition }
        : { '--mf-maxh': maxH }
    "
  >
    <img :src="src" :alt="alt" @error="emit('error')" />
  </div>
</template>

<style scoped>
/* CONTAIN: center the picture in its column; the <img> carries the frame and
   self-sizes, so the bordered box is exactly the rendered image — no gaps. */
.media-frame.is-contain {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
}
.media-frame.is-contain img {
  display: block;
  max-width: 100%;
  max-height: var(--mf-maxh, min(46vh, 460px));
  width: auto;
  height: auto;
  object-fit: contain;
  background: var(--surface-2);
}
/* FILL: drive the height toward the frame so the picture grows to fill the space
   (instead of sitting small with emptiness around it). The <img> stays the sizing
   element (width:auto), so the box still equals the image — fills AND hugs, no
   letterbox, no crop. `max-height: maxH` is a viewport-relative ceiling so a tall
   picture can never overflow the screen even though the stage column is itself
   height-indefinite (it would otherwise fall back to the image's natural height).
   A wide landscape hits max-width:100% first and the height follows the ratio. */
.media-frame.is-contain.fill {
  align-self: stretch;
}
.media-frame.is-contain.fill img {
  height: 100%;
  max-height: var(--mf-maxh, 70vh);
  width: auto;
  max-width: 100%;
}
.media-frame.is-contain.framed img {
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius-lg);
}
/* COVER: the picture fills a fixed-shape frame, keeping the focal point in view. */
.media-frame.is-cover {
  display: block;
  width: 100%;
  overflow: hidden;
  background: var(--surface-2);
  line-height: 0;
}
.media-frame.is-cover.framed {
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius-lg);
}
.media-frame.is-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: var(--mf-pos, 50% 50%);
}
</style>
