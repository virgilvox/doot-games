<script setup lang="ts">
/**
 * Renders one field of an auto-generated editor form from its `FieldNode`, and
 * recurses for objects, arrays, and discriminated unions. It also applies a few
 * Doot field-name conventions on top of the raw schema:
 *   - `image` (string)            → URL input + live preview
 *   - `timer` / any nullable num  → a number with an on/off toggle
 *   - `prompt` / `body`           → a multi-line textarea
 *   - `correct` (number, with a sibling `options` array) → a "mark correct" select
 *   - `id` inside an array item   → a compact, auto-seeded slug field
 * Anything it doesn't recognise falls back to a plain input for its kind.
 */
import { computed } from 'vue'
import ImageField from '../components/ImageField.vue'
import { type FieldNode, blankValue, humanizeName, reindexAfterArrayEdit } from './introspect'

const props = defineProps<{
  node: FieldNode
  name: string
  modelValue: unknown
  /** Sibling values, so a field can read its neighbours (e.g. `correct` reads `options`). */
  parent?: Record<string, unknown>
  /** Overrides the humanized field name as the label. */
  forceLabel?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const label = computed(() => props.forceLabel ?? (props.name === 'id' ? 'ID' : humanizeName(props.name)))
/** Help text from the schema's `.describe()`, shown under the field. */
const hint = computed(() => props.node.description ?? '')

// Any string field named `image` or ending in `Image` (e.g. `revealImage`) gets the
// URL+preview+upload control, not a bare text box.
const isImage = computed(() => props.node.kind === 'string' && /(^|[a-z])image$/i.test(props.name))
// Multi-line fields: a question prompt, or a slide's body copy.
const isPrompt = computed(() => props.node.kind === 'string' && (props.name === 'prompt' || props.name === 'body'))
const isId = computed(() => props.node.kind === 'string' && props.name === 'id')
const isCorrect = computed(
  () => props.node.kind === 'number' && props.name === 'correct' && Array.isArray(props.parent?.options),
)
const isNullableNumber = computed(() => props.node.kind === 'number' && !!props.node.nullable)

const optionLabels = computed(() => {
  const options = props.parent?.options
  if (!Array.isArray(options)) return []
  return options.map((o, i) => {
    const label = (o as { label?: string } | null)?.label
    return label && label.trim() ? label : `Option ${i + 1}`
  })
})

// ── object ────────────────────────────────────────────────────────────
const objValue = computed(() => (props.modelValue ?? {}) as Record<string, unknown>)
function setKey(key: string, value: unknown) {
  const next: Record<string, unknown> = { ...objValue.value, [key]: value }
  // Keep a nested object's "mark correct" index pinned to its option through an
  // options reorder/remove/edit (the same options↔correct convention SchemaForm uses).
  if (key === 'options' && typeof objValue.value.correct === 'number') {
    next.correct = reindexAfterArrayEdit(objValue.value.options, value, objValue.value.correct as number)
  }
  emit('update:modelValue', next)
}

// ── array ─────────────────────────────────────────────────────────────
const arrValue = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []) as unknown[])
function newItem(): unknown {
  if (props.node.kind !== 'array') return null
  const item = blankValue(props.node.element)
  // Seed a unique id for `{ id, label }`-style items so the host needn't invent one.
  if (item && typeof item === 'object' && 'id' in item && !(item as { id?: string }).id) {
    ;(item as { id: string }).id = `i_${Math.random().toString(36).slice(2, 8)}`
  }
  return item
}
function emitArr(next: unknown[]) {
  emit('update:modelValue', next)
}
function addItem() {
  emitArr([...arrValue.value, newItem()])
}
function removeItem(i: number) {
  emitArr(arrValue.value.filter((_, idx) => idx !== i))
}
function moveItem(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= arrValue.value.length) return
  const next = [...arrValue.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  emitArr(next)
}
function setItem(i: number, value: unknown) {
  const next = [...arrValue.value]
  next[i] = value
  emitArr(next)
}
function setItemKey(i: number, key: string, value: unknown) {
  const item = { ...((arrValue.value[i] ?? {}) as Record<string, unknown>), [key]: value }
  setItem(i, item)
}

// ── discriminated union ────────────────────────────────────────────────
const unionTag = computed(() => {
  if (props.node.kind !== 'union') return ''
  return String(objValue.value[props.node.discriminator] ?? props.node.variants[0]?.tag ?? '')
})
const activeVariant = computed(() => {
  if (props.node.kind !== 'union') return undefined
  return props.node.variants.find((v) => v.tag === unionTag.value) ?? props.node.variants[0]
})
function switchVariant(tag: string) {
  if (props.node.kind !== 'union') return
  const variant = props.node.variants.find((v) => v.tag === tag)
  if (!variant) return
  const next: Record<string, unknown> = { [props.node.discriminator]: tag }
  for (const f of variant.fields) next[f.name] = blankValue(f.node)
  emit('update:modelValue', next)
}

function onNumber(raw: string) {
  emit('update:modelValue', raw === '' ? null : Number(raw))
}
function toggleNullableNumber(on: boolean) {
  if (props.node.kind !== 'number') return
  emit('update:modelValue', on ? ((props.node.defaultValue as number | undefined) ?? 0) : null)
}
</script>

<template>
  <!-- image: url + preview -->
  <ImageField
    v-if="isImage"
    :label="label"
    :model-value="(modelValue as string) ?? ''"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <!-- prompt: textarea -->
  <label v-else-if="isPrompt" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <textarea
      class="sf-textarea"
      rows="2"
      :maxlength="node.maxLength"
      :value="(modelValue as string) ?? ''"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
    <p v-if="node.maxLength" class="sf-hint sf-count">{{ ((modelValue as string) ?? '').length }} / {{ node.maxLength }}</p>
  </label>

  <!-- correct: pick the right option -->
  <label v-else-if="isCorrect" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <select
      class="sf-select"
      :value="String(modelValue ?? 0)"
      @change="emit('update:modelValue', Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="(opt, i) in optionLabels" :key="i" :value="i">{{ opt }}</option>
    </select>
    <p class="sf-hint">Withheld from players until the reveal.</p>
  </label>

  <!-- nullable number (e.g. timer): on/off toggle + value -->
  <div v-else-if="isNullableNumber" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <label class="sf-toggle">
      <input
        type="checkbox"
        :checked="modelValue != null"
        @change="toggleNullableNumber(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ modelValue != null ? 'On' : 'Off' }}</span>
    </label>
    <input
      v-if="modelValue != null"
      class="sf-input"
      type="number"
      min="0"
      style="margin-top: 8px"
      :value="modelValue as number"
      @input="onNumber(($event.target as HTMLInputElement).value)"
    />
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
  </div>

  <!-- id: compact slug -->
  <label v-else-if="isId" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <input
      class="sf-input sf-input--id"
      :value="(modelValue as string) ?? ''"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
  </label>

  <!-- plain string -->
  <label v-else-if="node.kind === 'string'" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <input
      class="sf-input"
      :maxlength="node.maxLength"
      :value="(modelValue as string) ?? ''"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
  </label>

  <!-- plain number -->
  <label v-else-if="node.kind === 'number'" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <input
      class="sf-input"
      type="number"
      :value="modelValue as number"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
  </label>

  <!-- boolean -->
  <div v-else-if="node.kind === 'boolean'" class="sf-field">
    <label class="sf-toggle">
      <input
        type="checkbox"
        :checked="!!modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ label }}</span>
    </label>
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
  </div>

  <!-- enum -->
  <label v-else-if="node.kind === 'enum'" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <select
      class="sf-select"
      :value="modelValue as string"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="v in node.values" :key="v" :value="v">{{ v }}</option>
    </select>
    <p v-if="hint" class="sf-hint">{{ hint }}</p>
  </label>

  <!-- discriminated union -->
  <div v-else-if="node.kind === 'union'" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <select class="sf-select" :value="unionTag" @change="switchVariant(($event.target as HTMLSelectElement).value)">
      <option v-for="v in node.variants" :key="v.tag" :value="v.tag">{{ humanizeName(v.tag) }}</option>
    </select>
    <div v-if="activeVariant" class="sf-group" style="margin-top: 11px">
      <SchemaField
        v-for="f in activeVariant.fields"
        :key="f.name"
        :node="f.node"
        :name="f.name"
        :parent="objValue"
        :model-value="objValue[f.name]"
        @update:model-value="setKey(f.name, $event)"
      />
    </div>
  </div>

  <!-- array -->
  <div v-else-if="node.kind === 'array'" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <p v-if="hint" class="sf-hint" style="margin-top: 0; margin-bottom: 8px">{{ hint }}</p>
    <div class="sf-array">
      <div v-for="(item, i) in arrValue" :key="i" class="sf-array-item">
        <div class="sf-array-head">
          <span class="sf-array-index">#{{ i + 1 }}</span>
          <div class="sf-array-controls">
            <button type="button" class="sf-icon-btn" :disabled="i === 0" aria-label="Move up" @click="moveItem(i, -1)">↑</button>
            <button type="button" class="sf-icon-btn" :disabled="i === arrValue.length - 1" aria-label="Move down" @click="moveItem(i, 1)">↓</button>
            <button type="button" class="sf-icon-btn" aria-label="Remove" @click="removeItem(i)">✕</button>
          </div>
        </div>
        <!-- object items: flatten the item's fields inline -->
        <template v-if="node.element.kind === 'object'">
          <SchemaField
            v-for="f in node.element.fields"
            :key="f.name"
            :node="f.node"
            :name="f.name"
            :parent="(item as Record<string, unknown>)"
            :model-value="(item as Record<string, unknown>)[f.name]"
            @update:model-value="setItemKey(i, f.name, $event)"
          />
        </template>
        <!-- scalar items -->
        <SchemaField
          v-else
          :node="node.element"
          :name="`${name} ${i + 1}`"
          :force-label="`${label} ${i + 1}`"
          :model-value="item"
          @update:model-value="setItem(i, $event)"
        />
      </div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" style="margin-top: 10px" @click="addItem">
      + Add {{ humanizeName(name).replace(/s$/, '').toLowerCase() }}
    </button>
  </div>

  <!-- nested object -->
  <div v-else-if="node.kind === 'object'" class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <p v-if="hint" class="sf-hint" style="margin-top: 0; margin-bottom: 8px">{{ hint }}</p>
    <div class="sf-group">
      <SchemaField
        v-for="f in node.fields"
        :key="f.name"
        :node="f.node"
        :name="f.name"
        :parent="objValue"
        :model-value="objValue[f.name]"
        @update:model-value="setKey(f.name, $event)"
      />
    </div>
  </div>
</template>
