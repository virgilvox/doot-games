<script setup lang="ts">
/**
 * Phone draw vote: tap the best drawing. The player's OWN drawing is hidden
 * (you can't vote for yourself), found by matching their submission from the
 * draw round (the relay only gives a player their own input back).
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { DrawThumb } from '@doot-games/ui'
import type { DrawValue } from '@doot-games/ui'
import { computed } from 'vue'
import type { DrawVoteContent, DrawVoteInput } from './block'

const props = defineProps<{ content: DrawVoteContent; modelValue: DrawVoteInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: DrawVoteInput] }>()

const room = injectDootRoom()
const myKey = computed(() => {
  const prev = room.round.value.index - 1
  const mine = prev >= 0 ? (room.inputFor(prev) as DrawValue | undefined) : undefined
  return mine?.strokes?.length ? JSON.stringify(mine.strokes) : ''
})
const visible = computed(() =>
  props.content.options.filter((o) => !myKey.value || JSON.stringify(o.drawing.strokes) !== myKey.value),
)

function pick(id: string) {
  if (!props.disabled) emit('update:modelValue', { choice: id })
}
</script>

<template>
  <div class="dv-player">
    <p class="lead" aria-live="polite">Tap the best drawing</p>
    <p v-if="!visible.length" class="empty">
      {{ content.options.length ? 'No other drawings to vote on.' : 'Waiting for drawings...' }}
    </p>
    <div v-else class="grid" role="radiogroup" aria-label="Drawings to vote on">
      <button
        v-for="(o, i) in visible"
        :key="o.id"
        type="button"
        class="cell"
        :class="{ on: modelValue.choice === o.id }"
        role="radio"
        :aria-checked="modelValue.choice === o.id"
        :aria-label="`Vote for drawing ${i + 1}`"
        :disabled="disabled"
        @click="pick(o.id)"
      >
        <DrawThumb :value="o.drawing" :aspect="content.aspect" :label="`Drawing ${i + 1}`" />
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
  transition: border-color 0.12s, transform 0.12s;
}
.cell:disabled {
  cursor: default;
}
.cell.on {
  border-color: var(--primary);
  transform: scale(1.02);
}
</style>
