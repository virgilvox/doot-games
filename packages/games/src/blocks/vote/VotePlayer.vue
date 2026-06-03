<script setup lang="ts">
/**
 * Phone vote: tap the best answer. The player's OWN answer is hidden so they
 * can't vote for themselves. The generic renderer passes `myMakeText` (this
 * player's own make submission rendered to votable text, for ANY make block, so
 * fill/quip both work); we fall back to reading their prior-round `.text` for
 * mount paths that don't pass it. Computed locally, so the gallery stays
 * anonymous (the public config never carries author info).
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { OptionGrid } from '@doot-games/ui'
import { computed } from 'vue'
import type { VoteContent, VoteInput } from './block'

const props = defineProps<{
  content: VoteContent
  modelValue: VoteInput
  disabled?: boolean
  /** This player's own submission rendered to votable text (from the renderer). */
  myMakeText?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: VoteInput] }>()

const room = injectDootRoom()
// The make round that fed this vote is the immediately prior round.
const myText = computed(() => {
  if (props.myMakeText?.trim()) return props.myMakeText.trim()
  const prev = room.round.value.index - 1
  const mine = prev >= 0 ? (room.inputFor(prev) as { text?: string } | undefined) : undefined
  return mine?.text?.trim() ?? ''
})
const visible = computed(() => props.content.options.filter((o) => o.text.trim() !== myText.value))
const selectedIndex = computed(() => visible.value.findIndex((o) => o.id === props.modelValue.choice))

function onSelect(i: number) {
  const opt = visible.value[i]
  if (opt) emit('update:modelValue', { choice: opt.id })
}
</script>

<template>
  <div class="vote-player">
    <p v-if="!visible.length" class="empty" aria-live="polite">
      {{ content.options.length ? 'No other answers to vote on this round.' : 'Waiting for answers...' }}
    </p>
    <OptionGrid
      v-else
      :options="visible.map((o) => ({ label: o.text }))"
      :selected="selectedIndex"
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
</style>
