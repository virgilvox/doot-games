<script setup lang="ts">
/** Phone vote for Split the Room: Yes/No on each dividing scenario. */
import { computed } from 'vue'
import type { SplitContent, SplitInput } from './block'

const props = defineProps<{ content: SplitContent; modelValue: SplitInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: SplitInput] }>()

const votes = computed(() => props.modelValue.votes ?? {})
function vote(id: string, v: 'yes' | 'no') {
  emit('update:modelValue', { votes: { ...votes.value, [id]: v } })
}
</script>

<template>
  <div class="split">
    <p v-if="!content.scenarios.length" class="empty" aria-live="polite">Waiting for the room's dilemmas...</p>
    <div v-for="s in content.scenarios" :key="s.id" class="srow">
      <p class="stext">{{ s.text }}</p>
      <div class="syn" role="group" :aria-label="s.text">
        <button
          type="button"
          class="syn-btn yes"
          :class="{ on: votes[s.id] === 'yes' }"
          :aria-pressed="votes[s.id] === 'yes'"
          :disabled="disabled"
          @click="vote(s.id, 'yes')"
        >
          Yes
        </button>
        <button
          type="button"
          class="syn-btn no"
          :class="{ on: votes[s.id] === 'no' }"
          :aria-pressed="votes[s.id] === 'no'"
          :disabled="disabled"
          @click="vote(s.id, 'no')"
        >
          No
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.split {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.empty {
  color: var(--ink-soft);
  text-align: center;
  padding: 24px 0;
}
.srow {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.stext {
  font-weight: 700;
  font-size: clamp(16px, 4.4vw, 19px);
  line-height: 1.4;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
.syn {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.syn-btn {
  font: inherit;
  font-weight: 800;
  font-size: 17px;
  padding: 12px;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  transition: transform 0.08s, background 0.12s, border-color 0.12s;
}
.syn-btn:not(:disabled):active {
  transform: translate(1px, 1px);
}
.syn-btn.yes.on {
  background: var(--c5);
  color: var(--primary-ink);
  border-color: var(--line);
}
.syn-btn.no.on {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--line);
}
</style>
