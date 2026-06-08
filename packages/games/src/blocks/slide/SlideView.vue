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
const layout = computed(() =>
  showImage.value && hasText.value ? 'combo' : showImage.value ? 'image-only' : 'text-only',
)
</script>

<template>
  <div class="slide" :class="layout">
    <img v-if="showImage" class="slide-img" :src="image" alt="" @error="failed = true" />
    <div v-if="hasText" class="slide-text">
      <h1 v-if="heading" class="slide-heading">{{ heading }}</h1>
      <p v-if="body" class="slide-body">{{ body }}</p>
    </div>
  </div>
</template>

<style scoped>
.slide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 3vw, 44px);
  width: 100%;
  height: 100%;
  min-height: 0;
  text-align: center;
}
/* Image + text sit side by side on a wide screen, and stack on a narrow one. */
.slide.combo {
  flex-wrap: wrap;
}
.slide.combo .slide-text {
  text-align: left;
}
.slide-img {
  max-width: 100%;
  max-height: min(70vh, 620px);
  object-fit: contain;
  border-radius: var(--radius-lg);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
}
.slide.combo .slide-img {
  flex: 1 1 320px;
  min-width: 0;
}
.slide-text {
  flex: 1 1 340px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 1.6vw, 18px);
}
.slide-heading {
  font-family: var(--font-display, inherit);
  font-weight: 800;
  line-height: 1.05;
  font-size: clamp(28px, 5vw, 64px);
  overflow-wrap: anywhere;
}
.slide-body {
  font-size: clamp(16px, 2.4vw, 30px);
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
</style>
