<script setup lang="ts">
/**
 * Phone view for a Faker make round. The `content` prop is this player's SECRET
 * per-player view (delivered to their own private address): a non-faker is shown
 * the word, the faker is told they are the faker and shown only the category. Both
 * write a one-word clue. Role is signalled with color + a shape + a text label
 * (never color alone), so it reads for everyone.
 */
import { Icon } from '@doot-games/ui'
import { computed } from 'vue'
import { type FakerInput, type FakerSecret, normalizeClue } from './block'

const props = defineProps<{ content: FakerSecret; modelValue: FakerInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: FakerInput] }>()

const isFaker = computed(() => props.content?.isFaker === true)
const category = computed(() => props.content?.category ?? '')
const word = computed(() => props.content?.word ?? '')

function onInput(e: Event) {
  // One short token: trim and collapse to a single word.
  const clue = normalizeClue((e.target as HTMLInputElement).value).slice(0, 24)
  emit('update:modelValue', { clue })
}
</script>

<template>
  <div class="faker" :class="{ imposter: isFaker }">
    <div v-if="isFaker" class="role faker-role">
      <span class="role-badge"><Icon name="mask" :size="20" /> You're the faker</span>
      <p class="role-line">You don't know the word. Bluff a clue that fits the category and blend in.</p>
    </div>
    <div v-else class="role know-role">
      <span class="role-badge"><Icon name="eye" :size="20" /> You know the word</span>
      <p class="role-line">Give a clue that proves it, without making it too obvious.</p>
    </div>

    <div class="card">
      <div class="kicker">Category</div>
      <div class="category">{{ category }}</div>
      <template v-if="!isFaker">
        <div class="kicker word-kicker">The secret word</div>
        <div class="word">{{ word }}</div>
      </template>
      <p v-else class="unknown">The word is hidden from you.</p>
    </div>

    <label class="clue-label" for="faker-clue">Your one-word clue</label>
    <input
      id="faker-clue"
      class="clue-input"
      type="text"
      :value="modelValue.clue"
      :disabled="disabled"
      maxlength="24"
      autocomplete="off"
      autocapitalize="none"
      placeholder="one word"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.faker {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.role {
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  padding: 12px 14px;
}
.faker-role {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, var(--surface-2));
}
.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 14px;
}
.faker-role .role-badge {
  color: var(--primary);
}
.know-role .role-badge {
  color: var(--c5);
}
.role-line {
  margin-top: 6px;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.4;
}
.card {
  border-radius: var(--radius);
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.kicker {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 12px;
}
.category {
  font-size: clamp(22px, 6vw, 30px);
  font-weight: 800;
  color: var(--ink);
}
.word-kicker {
  margin-top: 12px;
}
.word {
  font-size: clamp(26px, 8vw, 40px);
  font-weight: 900;
  color: var(--c5);
  letter-spacing: 0.01em;
}
.unknown {
  margin-top: 10px;
  font-weight: 700;
  color: var(--primary);
}
.clue-label {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.clue-input {
  width: 100%;
  font: inherit;
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.clue-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
