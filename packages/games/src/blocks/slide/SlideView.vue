<script setup lang="ts">
/**
 * Renders an info slide (a heading, body text, an image, or any combination) the
 * same way on the big screen and on phones. A display block, so it takes no input;
 * the host advances it. Font sizes scale with the viewport (clamp + vw), so the
 * same component reads large on a TV and right-sized on a phone.
 *
 * Used as both the block's HostDisplay and PlayerInput; the extra props those
 * call sites pass (inputs/state/answer/modelValue) are ignored (inheritAttrs off).
 */
import { MediaFrame, useFitScale } from '@doot-games/ui'
import { computed, ref, watch } from 'vue'
import type { SlideContent } from './block'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ content: SlideContent }>()
// Declared so the v-model binding at the PlayerInput call site doesn't warn; a
// display slide never emits (it has no input).
defineEmits<{ 'update:modelValue': [value: unknown] }>()

const heading = computed(() => props.content?.heading?.trim() ?? '')
const body = computed(() => props.content?.body?.trim() ?? '')
const image = computed(() => props.content?.image?.trim() ?? '')
const hasText = computed(() => !!heading.value || !!body.value)
const failed = ref(false)
watch(image, () => {
  failed.value = false
})
const showImage = computed(() => !!image.value && !failed.value)
// Author picks how the picture sits with the text. `auto` keeps the long-standing
// side-by-side. With only one of image/text, the choice is moot.
const authored = computed(() => props.content?.layout ?? 'auto')
const layout = computed(() => {
  if (!showImage.value) return 'text-only'
  if (!hasText.value) return 'image-only'
  return authored.value === 'banner' ? 'banner' : 'side'
})

// Adapt the type size so the whole slide is visible at a glance on the big screen
// (a display slide should fit, not scroll). Shrinks only when the content would
// overflow; re-fits when the text/image/layout or the stage size changes.
const slideRoot = ref<HTMLElement | null>(null)
useFitScale(slideRoot, () => `${heading.value}|${body.value}|${image.value}|${layout.value}`, { min: 0.45 })
</script>

<template>
  <div ref="slideRoot" class="slide" :class="layout">
    <MediaFrame
      v-if="showImage"
      class="slide-img"
      :src="image"
      :fill="layout === 'side' || layout === 'image-only'"
      :max-h="layout === 'banner' ? 'min(52vh, 480px)' : layout === 'image-only' ? '76vh' : '72vh'"
      @error="failed = true"
    />
    <div v-if="hasText" class="slide-text">
      <h1 v-if="heading" class="slide-heading">{{ heading }}</h1>
      <p v-if="body" class="slide-body">{{ body }}</p>
    </div>
  </div>
</template>

<style scoped>
.slide {
  display: flex;
  /* "safe center" centers when the slide fits but falls back to the start edge
     when the content is taller than the stage, so a long body scrolls from the
     top (its first line reachable) instead of being centered out of view. */
  align-items: safe center;
  justify-content: safe center;
  gap: calc(clamp(18px, 3vw, 44px) * var(--fit, 1));
  width: 100%;
  height: 100%;
  min-height: 0;
  text-align: center;
}
/* Side: image + text side by side on a wide screen, stacking on a narrow one. */
.slide.side {
  flex-wrap: wrap;
}
.slide.side .slide-text {
  text-align: left;
}
/* Banner: image centered on top (full width), text centered below it. */
.slide.banner {
  flex-direction: column;
}
.slide.banner .slide-text {
  text-align: center;
  align-items: center;
}
/* Side: the picture fills the stage height beside the text and hugs the image
   (MediaFrame fill). flex:0 (no grow) keeps the frame the picture's own width —
   a portrait stays narrow, a landscape caps its width so the text keeps room —
   so there is never an empty letterbox band inside the card. */
.slide.side .slide-img {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(58%, 720px);
}
/* Banner: a centered hero capped in height (MediaFrame handles wrap + cap). */
.slide.banner .slide-img {
  flex: none;
  max-width: 100%;
}
/* Image-only: the picture fills the whole stage. */
.slide.image-only .slide-img {
  flex: 1;
  min-height: 0;
  max-width: 100%;
}
.slide-text {
  flex: 1 1 340px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(clamp(10px, 1.6vw, 18px) * var(--fit, 1));
}
/* `--fit` (set by useFitScale) shrinks the type just enough to keep the whole
   slide on screen, so a long body fits at a glance instead of scrolling. */
.slide-heading {
  font-family: var(--font-display, inherit);
  font-weight: 800;
  line-height: 1.05;
  font-size: calc(clamp(28px, 5vw, 64px) * var(--fit, 1));
  overflow-wrap: anywhere;
}
.slide-body {
  font-size: calc(clamp(16px, 2.4vw, 30px) * var(--fit, 1));
  line-height: 1.45;
  color: var(--ink-soft);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.slide.text-only .slide-text {
  text-align: center;
  align-items: center;
}
.slide.text-only .slide-body {
  max-width: 26ch;
}
.slide.banner .slide-body {
  max-width: 46ch;
}
</style>
