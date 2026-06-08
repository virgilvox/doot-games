<script setup lang="ts">
/**
 * Renders a title card (a big centered title + optional subtitle), the same on the
 * big screen and phones. A display block, so it takes no input; the host advances
 * it. A title card is the section-divider / "and now…" beat between rounds.
 *
 * Used as both the block's HostDisplay and PlayerInput; the extra props those call
 * sites pass are ignored (inheritAttrs off).
 */
import { computed } from 'vue'
import type { TitleContent } from './block'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ content: TitleContent }>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()

const title = computed(() => props.content?.title?.trim() ?? '')
const subtitle = computed(() => props.content?.subtitle?.trim() ?? '')
</script>

<template>
  <div class="titlecard">
    <span v-if="subtitle" class="tc-kicker">{{ subtitle }}</span>
    <h1 class="tc-title">{{ title }}</h1>
  </div>
</template>

<style scoped>
.titlecard {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2vw, 20px);
  width: 100%;
  height: 100%;
  min-height: 0;
  text-align: center;
}
.tc-kicker {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--primary);
  font-size: clamp(13px, 1.8vw, 22px);
  overflow-wrap: anywhere;
}
.tc-title {
  font-family: var(--font-display, inherit);
  font-weight: 900;
  line-height: 1.02;
  font-size: clamp(36px, 8vw, 96px);
  overflow-wrap: anywhere;
}
</style>
