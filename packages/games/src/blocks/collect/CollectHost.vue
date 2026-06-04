<script setup lang="ts">
/** Big-screen host view for Collect: a gallery (photos) or a wall (text) that fills
 *  in live as players share. */
import { computed } from 'vue'
import type { CollectContent, CollectInput } from './block'

const props = defineProps<{
  content: CollectContent
  inputs: Map<string, CollectInput>
  state: string
  answer?: unknown
}>()

const shares = computed(() => [...props.inputs.values()].filter((v) => v?.media || v?.text?.trim()))
const photos = computed(() => shares.value.filter((v): v is CollectInput & { media: string } => !!v.media))
const texts = computed(() => shares.value.filter((v) => !v.media && !!v.text?.trim()))
</script>

<template>
  <div class="collect-host">
    <div class="collect-host-head">
      <span class="count">{{ shares.length }}</span>
      <span class="count-label">shared</span>
    </div>
    <div v-if="photos.length" class="gallery">
      <img v-for="(s, i) in photos" :key="i" :src="s.media" alt="A shared photo" class="tile" />
    </div>
    <div v-if="texts.length" class="texts">
      <p v-for="(s, i) in texts" :key="i" class="text-card">{{ s.text }}</p>
    </div>
    <p v-if="!shares.length" class="empty">
      {{ state === 'open' ? 'Waiting for the first share…' : 'Shares will appear here.' }}
    </p>
  </div>
</template>

<style scoped>
.collect-host {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}
.collect-host-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.count {
  font-size: clamp(40px, 8vw, 72px);
  font-weight: 900;
  line-height: 1;
  color: var(--primary);
}
.count-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink-soft);
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  width: 100%;
}
.tile {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
}
.texts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}
.text-card {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}
.empty {
  color: var(--ink-soft);
  font-size: 18px;
}
</style>
