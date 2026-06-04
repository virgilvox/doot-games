<script setup lang="ts">
/**
 * Phone photo vote: tap the best photo. The player's OWN photo is hidden (you can't
 * vote for yourself), found by matching their submission from the collect round (the
 * relay only gives a player their own input back).
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { PhotoVoteContent, PhotoVoteInput } from './block'

const props = defineProps<{ content: PhotoVoteContent; modelValue: PhotoVoteInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: PhotoVoteInput] }>()

const room = injectDootRoom()
const myMedia = computed(() => {
  const prev = room.round.value.index - 1
  const mine = prev >= 0 ? (room.inputFor(prev) as { media?: string } | undefined) : undefined
  return mine?.media ?? ''
})
const visible = computed(() => props.content.options.filter((o) => !myMedia.value || o.media !== myMedia.value))

function pick(id: string) {
  if (!props.disabled) emit('update:modelValue', { choice: id })
}
</script>

<template>
  <div class="pv-player">
    <p class="lead" aria-live="polite">Tap the best photo</p>
    <p v-if="!visible.length" class="empty">
      {{ content.options.length ? 'No other photos to vote on.' : 'Waiting for photos...' }}
    </p>
    <div v-else class="grid" role="radiogroup" aria-label="Photos to vote on">
      <button
        v-for="(o, i) in visible"
        :key="o.id"
        type="button"
        class="cell"
        :class="{ on: modelValue.choice === o.id }"
        role="radio"
        :aria-checked="modelValue.choice === o.id"
        :aria-label="`Vote for photo ${i + 1}`"
        :disabled="disabled"
        @click="pick(o.id)"
      >
        <img :src="o.media" :alt="`Photo ${i + 1}`" class="photo" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.lead {
  text-align: center;
  font-weight: 800;
  margin-bottom: 12px;
}
.empty {
  color: var(--ink-soft);
  text-align: center;
  padding: 24px 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.cell {
  padding: 0;
  border: 3px solid transparent;
  border-radius: 14px;
  background: none;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.12s, transform 0.12s;
}
.cell:disabled {
  cursor: default;
}
.cell.on {
  border-color: var(--primary);
  transform: scale(1.02);
}
.photo {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
</style>
