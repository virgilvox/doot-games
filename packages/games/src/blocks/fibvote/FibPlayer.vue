<script setup lang="ts">
/**
 * Phone fib vote: spot the TRUE answer among the lies. The player's OWN lie is
 * hidden (you can't vote for your own), found from their submission in the make
 * round (the relay only ever gives a player their own input back).
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { OptionGrid } from '@doot-games/ui'
import { computed } from 'vue'
import type { FibContent, FibInput } from './block'

const props = defineProps<{ content: FibContent; modelValue: FibInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: FibInput] }>()

const room = injectDootRoom()
const myText = computed(() => {
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
  <div class="fib-player">
    <p class="lead" aria-live="polite">Which one is the truth?</p>
    <p v-if="!visible.length" class="empty">
      {{ content.options.length ? 'No answers to vote on this round.' : 'Waiting for answers...' }}
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
</style>
