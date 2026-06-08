<script setup lang="ts">
/** Phone input for a Categories (Scattergories) round: the letter, then one text
 *  field per category. Everything must start with the letter. */
import { computed } from 'vue'
import type { CategoriesContent, CategoriesInput } from './logic'

const props = defineProps<{ content: CategoriesContent; modelValue: CategoriesInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: CategoriesInput] }>()

const letter = computed(() => (props.content.letter || '?').toUpperCase())
function set(id: string, e: Event) {
  const text = (e.target as HTMLInputElement).value.slice(0, 40)
  emit('update:modelValue', { answers: { ...props.modelValue.answers, [id]: text } })
}
</script>

<template>
  <div class="cats">
    <p class="cats-letter">Everything starts with <b>{{ letter }}</b></p>
    <label v-for="cat in content.categories" :key="cat.id" class="cats-row">
      <span class="cats-label">{{ cat.label }}</span>
      <input
        class="cats-input"
        type="text"
        :value="modelValue.answers[cat.id] ?? ''"
        :disabled="disabled"
        maxlength="40"
        :placeholder="`${letter}...`"
        autocomplete="off"
        autocapitalize="words"
        :aria-label="cat.label"
        @input="set(cat.id, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.cats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cats-letter {
  text-align: center;
  font-weight: 700;
  color: var(--ink-soft);
}
.cats-letter b {
  font-size: 1.4em;
  color: var(--primary);
}
.cats-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cats-label {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
}
.cats-input {
  width: 100%;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.cats-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
