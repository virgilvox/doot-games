<script setup lang="ts">
/**
 * "Pull from a deck" for one round: a `draw: N` control + a list of field bindings
 * (a content field <- a deck column). Introspective: it lists the block's bindable
 * scalar fields and the chosen deck's columns. Self-contained; the editor mounts it
 * for the selected round and applies the emitted { draw, bindings }. Resolution +
 * same-row correlation happen at host time (resolveComposition).
 */
import type { AnyBlock, DeckColumn, DeckUse, RoundInstance } from '@doot-games/sdk'
import { computed } from 'vue'

// `refColumns` carries the columns of any *linked* (library `{ ref }`) deck, fetched
// by the editor — an inline deck's columns travel in the deck itself, but a ref's
// don't, so the editor resolves them for the binding dropdowns.
const props = defineProps<{
  round: RoundInstance
  block?: AnyBlock
  decks?: Record<string, DeckUse>
  refColumns?: Record<string, DeckColumn[]>
}>()
const emit = defineEmits<{ change: [value: { draw?: number; bindings?: Record<string, { deck: string; column: string }> }] }>()

const deckIds = computed(() => Object.keys(props.decks ?? {}))
const hasDecks = computed(() => deckIds.value.length > 0)

/** Top-level string/number content fields are bindable (mode 1); arrays/objects and
 *  the timer/length settings are not. Derived from the block's default content. */
const bindableFields = computed<string[]>(() => {
  if (!props.block) return []
  const content = props.block.defaultContent() as Record<string, unknown>
  return Object.entries(content)
    .filter(([k, v]) => (typeof v === 'string' || typeof v === 'number') && k !== 'timer' && k !== 'maxLength')
    .map(([k]) => k)
})

function columnsOf(deckId: string): DeckColumn[] {
  const use = props.decks?.[deckId]
  if (use && 'inline' in use) return use.inline.columns
  // A linked (ref) deck: use the columns the editor fetched for it.
  return props.refColumns?.[deckId] ?? []
}

/** The column type a content field expects: an image field (by name) wants an image
 *  column; a numeric default wants a number; everything else is text. */
function fieldType(field: string): DeckColumn['type'] {
  if (/image|img|photo|avatar|cover/i.test(field)) return 'image'
  const v = (props.block?.defaultContent() as Record<string, unknown> | undefined)?.[field]
  return typeof v === 'number' ? 'number' : 'text'
}

/** Columns a field may bind to: an image field offers only image columns; a text/number
 *  field offers everything except image columns. Falls back to all columns if the filter
 *  would leave nothing, so the dropdown is never empty. */
function columnsFor(field: string, deckId: string): DeckColumn[] {
  const cols = columnsOf(deckId)
  const wantImage = fieldType(field) === 'image'
  const compatible = cols.filter((c) => (wantImage ? c.type === 'image' : c.type !== 'image'))
  return compatible.length ? compatible : cols
}

const rows = computed(() =>
  Object.entries(props.round.bindings ?? {}).map(([field, ref]) => ({ field, deck: ref.deck, column: ref.column })),
)
const draw = computed(() => props.round.draw ?? 1)

function emitChange(bindings: Record<string, { deck: string; column: string }>, drawN = draw.value) {
  emit('change', {
    draw: drawN > 1 ? drawN : undefined,
    bindings: Object.keys(bindings).length ? bindings : undefined,
  })
}
function setDraw(n: number) {
  emitChange(props.round.bindings ?? {}, Math.max(1, Math.floor(n) || 1))
}
function addBinding() {
  const used = new Set(rows.value.map((r) => r.field))
  const field = bindableFields.value.find((f) => !used.has(f)) ?? bindableFields.value[0]
  const deck = deckIds.value[0]
  if (!field || !deck) return
  emitChange({ ...(props.round.bindings ?? {}), [field]: { deck, column: columnsFor(field, deck)[0]?.key ?? '' } })
}
/** Rebuild the record when a row's field/deck/column changes (field is the key). */
function updateRow(oldField: string, patch: Partial<{ field: string; deck: string; column: string }>) {
  const cur = rows.value.find((r) => r.field === oldField)
  if (!cur) return
  const next = { field: cur.field, deck: cur.deck, column: cur.column, ...patch }
  // Switching deck (or field) resets the column to the new deck's first compatible column.
  if ((patch.deck && patch.deck !== cur.deck) || (patch.field && patch.field !== cur.field)) {
    next.column = columnsFor(next.field, next.deck)[0]?.key ?? ''
  }
  const record: Record<string, { deck: string; column: string }> = {}
  for (const r of rows.value) if (r.field !== oldField) record[r.field] = { deck: r.deck, column: r.column }
  record[next.field] = { deck: next.deck, column: next.column }
  emitChange(record)
}
function removeRow(field: string) {
  const record = { ...(props.round.bindings ?? {}) }
  delete record[field]
  emitChange(record)
}
</script>

<template>
  <div class="rb">
    <p v-if="!hasDecks" class="rb-hint">Add a deck in <strong>Decks</strong> to pull this round's fields from a row.</p>
    <template v-else>
      <label class="rb-draw">
        <span class="rb-label">Play</span>
        <input type="number" min="1" max="50" class="rb-num" :value="draw" @input="setDraw(Number(($event.target as HTMLInputElement).value))" />
        <span class="rb-label">round{{ draw === 1 ? '' : 's' }}, a different row each.</span>
      </label>

      <div v-for="r in rows" :key="r.field" class="rb-row">
        <select class="rb-sel" :value="r.field" aria-label="Field" @change="updateRow(r.field, { field: ($event.target as HTMLSelectElement).value })">
          <option v-for="f in bindableFields" :key="f" :value="f">{{ f }}</option>
        </select>
        <span class="rb-arrow">←</span>
        <select class="rb-sel" :value="r.deck" aria-label="Deck" @change="updateRow(r.field, { deck: ($event.target as HTMLSelectElement).value })">
          <option v-for="d in deckIds" :key="d" :value="d">{{ d }}</option>
        </select>
        <span class="rb-dot">.</span>
        <select class="rb-sel" :value="r.column" aria-label="Column" @change="updateRow(r.field, { column: ($event.target as HTMLSelectElement).value })">
          <option v-for="c in columnsFor(r.field, r.deck)" :key="c.key" :value="c.key">{{ c.key }}{{ c.type === 'image' ? ' ▦' : '' }}</option>
        </select>
        <button type="button" class="rb-x" aria-label="Remove binding" @click="removeRow(r.field)">✕</button>
      </div>

      <button type="button" class="btn btn-ghost btn-sm" :disabled="!bindableFields.length" @click="addBinding">+ Bind a field to a deck</button>
    </template>
  </div>
</template>

<style scoped>
.rb { display: flex; flex-direction: column; gap: 8px; }
.rb-hint { color: var(--ink-soft); font-size: 13px; margin: 0; }
.rb-draw { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rb-label { font-size: 13px; color: var(--ink-soft); }
.rb-num { width: 64px; font: inherit; padding: 6px 8px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); }
.rb-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rb-sel { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); }
.rb-arrow, .rb-dot { color: var(--mute); font-weight: 700; }
.rb-x { background: none; border: none; color: var(--mute); cursor: pointer; padding: 4px 6px; }
</style>
