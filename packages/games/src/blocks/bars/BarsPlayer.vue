<script setup lang="ts">
/**
 * Phone input for a guided rap verse: the robot's line is shown, the player
 * writes the line that rhymes back. One row per couplet; a rhyme hint nudges
 * (but never enforces) the rhyme.
 */
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import type { BarsContent, BarsInput } from './block'

const props = defineProps<{ content: BarsContent; modelValue: BarsInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: BarsInput] }>()

const lines = computed(() => props.modelValue.lines ?? [])
function onInput(i: number, e: Event) {
  const v = (e.target as HTMLInputElement).value.slice(0, props.content.maxLength)
  const next = [...(props.modelValue.lines ?? props.content.couplets.map(() => ''))]
  next[i] = v
  emit('update:modelValue', { lines: next })
}
</script>

<template>
  <div class="bars">
    <div v-for="(cp, i) in (content.couplets ?? [])" :key="i" class="couplet">
      <p class="lead"><span class="bot-tag"><Icon name="cpu" :size="16" /></span>{{ cp.lead }}</p>
      <label class="resp">
        <span class="resp-label">
          Your line<span v-if="cp.rhymeWith">, rhyme with “{{ cp.rhymeWith }}”</span>
        </span>
        <input
          class="bars-input"
          type="text"
          :value="lines[i] ?? ''"
          :maxlength="content.maxLength"
          :disabled="disabled"
          :aria-label="`Your rhyming line for: ${cp.lead}`"
          autocomplete="off"
          @input="onInput(i, $event)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.couplet {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lead {
  font-size: clamp(16px, 4.4vw, 20px);
  font-weight: 700;
  line-height: 1.35;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-left: 4px solid var(--primary);
  border-radius: var(--radius);
  padding: 11px 13px;
  overflow-wrap: anywhere;
}
.bot-tag {
  margin-right: 8px;
}
.resp {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.resp-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.bars-input {
  width: 100%;
  font: inherit;
  font-size: clamp(16px, 4.2vw, 19px);
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
}
.bars-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
