<script setup lang="ts">
/**
 * Order a set of items. Accessible reordering with up/down buttons (no drag
 * dependency). Two-way via v-model, an array of item ids in the chosen order.
 */
import { computed, ref } from 'vue'

interface Item {
  id: string
  label: string
  /** Optional picture for this item. Shown as a thumbnail so a picture-led round
   *  (rank these photos) is orderable on a phone, not just readable on the big
   *  screen. Text-only items are unchanged. */
  image?: string
}
const props = withDefaults(
  defineProps<{ items: Item[]; modelValue: string[]; disabled?: boolean }>(),
  { disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const labels = computed(() => new Map(props.items.map((i) => [i.id, i.label])))
const images = computed(() => new Map(props.items.map((i) => [i.id, i.image ?? ''])))
// A picture that 404s must not leave a broken-image glyph in the list.
const broken = ref(new Set<string>())
function markBroken(src: string) {
  const next = new Set(broken.value)
  next.add(src)
  broken.value = next
}
function pictureOf(id: string): string {
  const src = images.value.get(id) ?? ''
  return src && !broken.value.has(src) ? src : ''
}

function move(index: number, dir: -1 | 1) {
  if (props.disabled) return
  const next = [...props.modelValue]
  const j = index + dir
  if (j < 0 || j >= next.length) return
  const a = next[index]
  const b = next[j]
  if (a === undefined || b === undefined) return
  next[index] = b
  next[j] = a
  emit('update:modelValue', next)
}
</script>

<template>
  <ol class="ranklist">
    <li v-for="(id, i) in modelValue" :key="id" class="rank-item">
      <span class="pos mono">{{ i + 1 }}</span>
      <img
        v-if="pictureOf(id)"
        class="thumb"
        :src="pictureOf(id)"
        alt=""
        @error="markBroken(pictureOf(id))"
      />
      <span class="label">{{ labels.get(id) ?? id }}</span>
      <span class="moves">
        <button
          type="button"
          class="mv"
          :disabled="disabled || i === 0"
          :aria-label="`Move ${labels.get(id) ?? id} up`"
          @click="move(i, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="mv"
          :disabled="disabled || i === modelValue.length - 1"
          :aria-label="`Move ${labels.get(id) ?? id} down`"
          @click="move(i, 1)"
        >
          ↓
        </button>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.ranklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 11px 13px;
}
.pos {
  width: 30px;
  height: 30px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  font-weight: 700;
}
.thumb {
  flex: none;
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 9px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
}
.label {
  flex: 1;
  font-weight: 700;
  min-width: 0;
  overflow-wrap: anywhere;
}
.moves {
  display: flex;
  gap: 6px;
}
.mv {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
}
.mv:disabled {
  opacity: 0.35;
}
.mv:not(:disabled):active {
  transform: translateY(1px);
}
</style>
