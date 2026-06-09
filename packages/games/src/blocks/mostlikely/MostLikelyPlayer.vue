<script setup lang="ts">
/**
 * Phone vote for Most Likely To: tap a PLAYER from the lobby. The roster comes
 * from the room (the options are the lobby, not authored content). The chosen
 * player's name is captured on the vote so they stay named even if they leave.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { OptionGrid } from '@doot-games/ui'
import { computed } from 'vue'
import type { MostLikelyContent, MostLikelyInput } from './block'

defineProps<{ content: MostLikelyContent; modelValue: MostLikelyInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: MostLikelyInput] }>()

const room = injectDootRoom()
const roster = computed(() => room.players.value.map((p) => ({ id: p.id, name: p.name })))

function onSelect(i: number) {
  const p = roster.value[i]
  if (p) emit('update:modelValue', { choice: p.id, name: p.name })
}
</script>

<template>
  <div class="ml-player">
    <p class="empty" role="status">{{ roster.length ? '' : 'Waiting for players to join…' }}</p>
    <OptionGrid
      v-if="roster.length"
      :options="roster.map((p) => ({ label: p.name }))"
      :selected="roster.findIndex((p) => p.id === modelValue.choice)"
      :disabled="disabled"
      @select="onSelect"
    />
  </div>
</template>

<style scoped>
.empty {
  color: var(--ink-soft);
  text-align: center;
  padding: 24px 0;
}
/* The status region stays mounted with empty text (so it can announce); take no
   space while blank. */
.empty:empty {
  padding: 0;
}
</style>
