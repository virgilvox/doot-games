<script setup lang="ts">
/**
 * An editor form generated from a Zod schema, no per-block code. Pass a
 * block's `contentSchema` and v-model its content; the form renders a field per
 * key, handling nested objects, arrays (add/remove/reorder), and discriminated
 * unions. The schema is the source of truth, so a new block becomes authorable
 * the moment it ships.
 */
import { computed } from 'vue'
import SchemaField from './SchemaField.vue'
import { describeSchema, reindexAfterArrayEdit } from './introspect'

const props = defineProps<{
  /** A Zod schema (typically a block's `contentSchema`). */
  schema: unknown
  modelValue: Record<string, unknown>
  /** Top-level field names to omit (e.g. a derived block's runtime-built fields,
   *  which the author never sets by hand). */
  hide?: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

const root = computed(() => describeSchema(props.schema))
const fields = computed(() => {
  const all = root.value.kind === 'object' ? root.value.fields : []
  const hidden = props.hide ?? []
  return hidden.length ? all.filter((f) => !hidden.includes(f.name)) : all
})

function setKey(key: string, value: unknown) {
  const next: Record<string, unknown> = { ...props.modelValue, [key]: value }
  // Keep the "mark correct" index pinned to its option when the options array is
  // reordered/edited (the options↔correct convention; see reindexAfterArrayEdit).
  if (key === 'options' && typeof props.modelValue.correct === 'number') {
    next.correct = reindexAfterArrayEdit(props.modelValue.options, value, props.modelValue.correct as number)
  }
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="sf-form">
    <SchemaField
      v-for="f in fields"
      :key="f.name"
      :node="f.node"
      :name="f.name"
      :parent="modelValue"
      :model-value="modelValue[f.name]"
      @update:model-value="setKey(f.name, $event)"
    />
  </div>
</template>
