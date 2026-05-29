<script setup lang="ts">
/** Rate one or more categories on a configurable scale. Two-way via v-model. */
import { computed } from 'vue'

interface Category {
  id: string
  label: string
}
interface Scale {
  min: number
  max: number
  step: number
}
const props = withDefaults(
  defineProps<{
    categories: Category[]
    scale: Scale
    modelValue: Record<string, number>
    disabled?: boolean
  }>(),
  { disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, number>] }>()

const steps = computed(() => {
  const out: number[] = []
  for (let v = props.scale.min; v <= props.scale.max; v += props.scale.step) out.push(v)
  return out
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
        <span class="rval">{{ modelValue[cat.id] ?? '—' }}</span>
      </div>
      <!--
        A cumulative rating bar (every dot up to the value fills), so radio
        semantics would misrepresent it. Use a labelled group of toggle buttons:
        each announces "<category>: <value> of <max>" and its pressed state.
      -->
      <div class="rdots" role="group" :aria-label="`Rate ${cat.label}`">
        <button
          v-for="v in steps"
          :key="v"
          type="button"
          class="rdot"
          :class="{ on: (modelValue[cat.id] ?? -1) >= v }"
          :aria-label="`${cat.label}: ${v} of ${scale.max}`"
          :aria-pressed="modelValue[cat.id] === v"
          :disabled="disabled"
          @click="set(cat.id, v)"
        >
          {{ v }}
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
  grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
  gap: 6px;
}
.rdot {
  aspect-ratio: 1;
  border-radius: 9px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-soft);
  padding: 0;
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
