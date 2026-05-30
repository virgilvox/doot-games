<script setup lang="ts">
/**
 * Rate one or more categories on an ordered set of steps. The steps are a list
 * of `{ label, value }` so this works for numeric scales (1–10, stars), letter
 * grades (F→A), or tiers (D→S): the fill and selection use `value`; the label
 * is what's shown. Two-way via v-model (a record of category id -> value).
 */
import { computed } from 'vue'

interface Category {
  id: string
  label: string
}
interface Step {
  label: string
  value: number
}
const props = withDefaults(
  defineProps<{
    categories: Category[]
    steps: Step[]
    modelValue: Record<string, number>
    disabled?: boolean
  }>(),
  { disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, number>] }>()

const labelFor = computed(() => {
  const map = new Map(props.steps.map((s) => [s.value, s.label]))
  return (catId: string) => {
    const v = props.modelValue[catId]
    return v == null ? '-' : (map.get(v) ?? String(v))
  }
})

function set(catId: string, value: number) {
  if (props.disabled) return
  emit('update:modelValue', { ...props.modelValue, [catId]: value })
}
</script>

<template>
  <div class="rate">
    <div v-for="cat in categories" :key="cat.id" class="rate-cat">
      <div class="rtop">
        <span class="rlabel">{{ cat.label }}</span>
        <span class="rval">{{ labelFor(cat.id) }}</span>
      </div>
      <div class="rdots" role="group" :aria-label="`Rate ${cat.label}`">
        <button
          v-for="s in steps"
          :key="s.value"
          type="button"
          class="rdot"
          :class="{ on: (modelValue[cat.id] ?? Number.NEGATIVE_INFINITY) >= s.value }"
          :aria-label="`${cat.label}: ${s.label}`"
          :aria-pressed="modelValue[cat.id] === s.value"
          :disabled="disabled"
          @click="set(cat.id, s.value)"
        >
          {{ s.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rate {
  display: grid;
  gap: 12px;
}
.rate-cat {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
}
.rtop {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.rlabel {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 14px;
}
.rval {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  color: var(--c2);
  line-height: 1;
}
.rdots {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
  gap: 6px;
}
.rdot {
  min-height: 38px;
  border-radius: 9px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-soft);
  padding: 4px;
  transition: transform 0.06s, background 0.1s;
}
.rdot:not(:disabled):active {
  transform: scale(0.9);
}
.rdot.on {
  background: var(--c2);
  border-color: var(--line);
  color: var(--primary-ink);
}
</style>
