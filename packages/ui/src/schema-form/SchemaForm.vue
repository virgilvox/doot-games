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
import { describeSchema } from './introspect'

const props = defineProps<{
  /** A Zod schema (typically a block's `contentSchema`). */
  schema: unknown
  modelValue: Record<string, unknown>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

const root = computed(() => describeSchema(props.schema))
const fields = computed(() => (root.value.kind === 'object' ? root.value.fields : []))

function setKey(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
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
