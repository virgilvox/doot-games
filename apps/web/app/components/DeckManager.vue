<script setup lang="ts">
/**
 * Manage a game's content decks (config.decks): add by pasting CSV/TSV (from a
 * spreadsheet), preview the parsed columns + rows, and remove. Self-contained:
 * the editor mounts it with v-model over `config.decks`. Parsing is the pure
 * `parseSheet`; rounds bind to these decks via <RoundBindings>.
 */
import { parseSheet } from '@doot-games/games'
import type { DeckColumn, DeckUse } from '@doot-games/sdk'
import { computed, ref } from 'vue'

const props = defineProps<{ modelValue?: Record<string, DeckUse> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, DeckUse> | undefined] }>()

const decks = computed(() => props.modelValue ?? {})
const list = computed(() =>
  Object.entries(decks.value).map(([id, use]) => ({
    id,
    inline: 'inline' in use,
    cols: 'inline' in use ? use.inline.columns.length : 0,
    rows: 'inline' in use ? use.inline.rows.length : 0,
    columns: 'inline' in use ? use.inline.columns : ([] as DeckColumn[]),
  })),
)

const adding = ref(false)
const newName = ref('')
const pasteText = ref('')
const preview = ref<ReturnType<typeof parseSheet> | null>(null)
const expanded = ref<string | null>(null)

function doParse() {
  preview.value = parseSheet(pasteText.value)
}
const slugName = computed(() => newName.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
const canAdd = computed(
  () => !!slugName.value && !!preview.value && preview.value.columns.length > 0 && preview.value.rows.length > 0,
)
function confirmAdd() {
  if (!canAdd.value || !preview.value) return
  emit('update:modelValue', {
    ...decks.value,
    [slugName.value]: { inline: { columns: preview.value.columns, rows: preview.value.rows } },
  })
  reset()
}
function reset() {
  adding.value = false
  newName.value = ''
  pasteText.value = ''
  preview.value = null
}
function removeDeck(id: string) {
  const next = { ...decks.value }
  delete next[id]
  emit('update:modelValue', Object.keys(next).length ? next : undefined)
}
</script>

<template>
  <div class="dm">
    <p v-if="!list.length && !adding" class="dm-empty">
      No decks yet. A deck is a table of rows (questions, prompts, images…) you paste from a spreadsheet,
      then pull into rounds with “Pull from a deck”.
    </p>

    <ul v-if="list.length" class="dm-list">
      <li v-for="d in list" :key="d.id" class="dm-item">
        <div class="dm-row">
          <button type="button" class="dm-name" @click="expanded = expanded === d.id ? null : d.id">
            <span class="dm-id">{{ d.id }}</span>
            <span class="dm-meta">{{ d.rows }} row{{ d.rows === 1 ? '' : 's' }} · {{ d.cols }} col{{ d.cols === 1 ? '' : 's' }}{{ d.inline ? '' : ' · linked' }}</span>
          </button>
          <button type="button" class="dm-x" aria-label="Remove deck" @click="removeDeck(d.id)">✕</button>
        </div>
        <div v-if="expanded === d.id && d.columns.length" class="dm-cols">
          <span v-for="c in d.columns" :key="c.key" class="dm-col" :title="`${c.label} (${c.type})`">{{ c.key }}<small>{{ c.type === 'image' ? ' ▦' : c.type === 'number' ? ' #' : '' }}</small></span>
        </div>
      </li>
    </ul>

    <button v-if="!adding" type="button" class="btn btn-ghost btn-sm" @click="adding = true">+ Add a deck</button>

    <div v-else class="dm-add">
      <label class="dm-field">
        <span class="dm-label">Deck name</span>
        <input v-model="newName" class="dm-input" placeholder="e.g. capitals" />
        <small v-if="newName && slugName !== newName.trim()" class="dm-hint">saved as “{{ slugName }}”</small>
      </label>
      <label class="dm-field">
        <span class="dm-label">Paste CSV or a copy from Google Sheets / Excel (first row = headers)</span>
        <textarea
          v-model="pasteText"
          class="dm-textarea"
          rows="5"
          placeholder="country, capital, flag&#10;France, Paris, https://…/fr.png&#10;Japan, Tokyo, https://…/jp.png"
          @input="preview = null"
        />
      </label>
      <div class="dm-actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!pasteText.trim()" @click="doParse">Preview</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!canAdd" @click="confirmAdd">Add to game</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="reset">Cancel</button>
      </div>
      <div v-if="preview" class="dm-preview">
        <p v-if="!preview.columns.length" class="dm-err">Couldn’t parse a header + rows. Check the paste.</p>
        <template v-else>
          <p class="dm-ok">
            {{ preview.rows.length }} row{{ preview.rows.length === 1 ? '' : 's' }} ·
            columns: {{ preview.columns.map((c) => c.key).join(', ') }}
          </p>
          <ul v-if="preview.errors.length" class="dm-errs">
            <li v-for="(e, i) in preview.errors.slice(0, 5)" :key="i">{{ e }}</li>
          </ul>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dm { display: flex; flex-direction: column; gap: 10px; }
.dm-empty { color: var(--ink-soft); font-size: 13px; line-height: 1.5; margin: 0; }
.dm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dm-item { border: var(--bd) solid var(--line-soft); border-radius: var(--radius); background: var(--surface-2); }
.dm-row { display: flex; align-items: center; }
.dm-name { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: none; border: none; padding: 8px 12px; cursor: pointer; color: var(--ink); text-align: left; }
.dm-id { font-weight: 800; }
.dm-meta { font-size: 12px; color: var(--mute); }
.dm-x { background: none; border: none; color: var(--mute); cursor: pointer; padding: 8px 12px; font-size: 14px; }
.dm-cols { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 10px; }
.dm-col { font-size: 12px; font-weight: 700; background: var(--surface); border: var(--bd) solid var(--line-soft); border-radius: 6px; padding: 2px 7px; }
.dm-col small { color: var(--mute); }
.dm-add { display: flex; flex-direction: column; gap: 10px; border: var(--bd) dashed var(--line); border-radius: var(--radius); padding: 12px; }
.dm-field { display: flex; flex-direction: column; gap: 4px; }
.dm-label { font-size: 12px; font-weight: 700; color: var(--ink-soft); }
.dm-input, .dm-textarea { font: inherit; padding: 8px 10px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); }
.dm-textarea { resize: vertical; font-family: var(--font-mono); font-size: 13px; }
.dm-hint { color: var(--mute); font-size: 12px; }
.dm-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dm-preview { font-size: 13px; }
.dm-ok { color: var(--ink-soft); margin: 0; }
.dm-err { color: var(--primary); margin: 0; }
.dm-errs { margin: 6px 0 0; padding-left: 18px; color: var(--mute); font-size: 12px; }
</style>
