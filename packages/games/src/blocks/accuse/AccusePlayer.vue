<script setup lang="ts">
/**
 * Phone vote for the Accuse round: read every clue attributed to its author, then
 * tap the player you think was bluffing. Your own clue is shown but not tappable
 * (you can't accuse yourself). The accused player's name is captured on the vote so
 * they stay named even if they leave.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed } from 'vue'
import type { AccuseContent, AccuseInput } from './block'

const props = defineProps<{ content: AccuseContent; modelValue: AccuseInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: AccuseInput] }>()

const room = injectDootRoom()
const myId = computed(() => room.me.value.id)
const clues = computed(() => props.content.clues ?? [])

function pick(pid: string, name: string) {
  if (pid === myId.value) return
  emit('update:modelValue', { choice: pid, name })
}
</script>

<template>
  <div class="accuse">
    <p v-if="!clues.length" class="empty" aria-live="polite">Waiting for the clues...</p>
    <ul v-else class="clue-list" role="listbox" aria-label="Pick the faker">
      <li v-for="c in clues" :key="c.pid">
        <button
          type="button"
          class="clue"
          :class="{ self: c.pid === myId, chosen: modelValue.choice === c.pid }"
          :disabled="disabled || c.pid === myId"
          :aria-pressed="modelValue.choice === c.pid"
          @click="pick(c.pid, c.name)"
        >
          <span class="author">{{ c.name }}<span v-if="c.pid === myId" class="you"> (you)</span></span>
          <span class="word" :class="{ quiet: !c.clue }">{{ c.clue || '(no clue)' }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.accuse {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty {
  color: var(--ink-soft);
  text-align: center;
  padding: 24px 0;
}
.clue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.clue {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font: inherit;
  padding: 14px 16px;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
  color: var(--ink);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.12s, background 0.12s;
}
.clue.chosen {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface-2));
}
.clue.self {
  cursor: default;
  opacity: 0.7;
}
.author {
  font-weight: 700;
  color: var(--ink-soft);
  font-size: 14px;
}
.you {
  color: var(--mute);
}
.word {
  font-weight: 800;
  font-size: clamp(18px, 5vw, 22px);
  color: var(--ink);
}
.word.quiet {
  color: var(--mute);
  font-style: italic;
  font-weight: 600;
}
</style>
