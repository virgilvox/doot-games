<script setup lang="ts">
/**
 * Big-screen host view for Draw: a gallery that fills in live as players submit.
 * Thumbnails are SVG (DrawThumb) so a roomful of drawings renders without a
 * WebGL context per tile.
 */
import { DrawThumb, type DrawValue } from '@doot-games/ui'
import { computed } from 'vue'
import type { DrawContent } from './block'

const props = defineProps<{
  content: DrawContent
  inputs: Map<string, DrawValue>
  state: string
  answer?: unknown
}>()

const drawings = computed(() =>
  [...props.inputs.values()].filter((v) => Array.isArray(v?.strokes) && v.strokes.length > 0),
)
// When this draw round feeds a vote (liveGallery off), keep the gallery hidden so
// it stays a surprise for the anonymized vote; show only a count, like QuipHost.
const showGallery = computed(() => props.content.liveGallery !== false)
</script>

<template>
  <div class="draw-host">
    <div class="draw-host-head">
      <span class="count">{{ drawings.length }}</span>
      <span class="count-label">{{ drawings.length === 1 ? 'drawing in' : 'drawings in' }}</span>
    </div>
    <div v-if="showGallery && drawings.length" class="gallery">
      <DrawThumb v-for="(d, i) in drawings" :key="i" :value="d" :aspect="content.aspect" />
    </div>
    <p v-else-if="!showGallery" class="empty">
      {{ drawings.length ? 'Drawings locked in. The gallery opens for the vote.' : 'Sketching on their phones...' }}
    </p>
    <p v-else class="empty">
      {{ state === 'open' ? 'Waiting for the first strokes…' : 'Drawings will appear here.' }}
    </p>
  </div>
</template>

<style scoped>
.draw-host {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.draw-host-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.count {
  font-size: clamp(28px, 5vw, 44px);
  font-weight: 800;
  color: var(--primary);
}
.count-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-soft);
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  align-content: start;
  overflow: auto;
}
.empty {
  color: var(--ink-soft);
  font-size: 16px;
}
</style>
