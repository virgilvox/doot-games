<script setup lang="ts">
/**
 * The library deck editor: create or edit a reusable deck (name, description, kind,
 * visibility, remixable) and its columns + rows. Import a spreadsheet (CSV / paste
 * from Sheets) via the pure `parseSheet`, edit cells in a grid, and upload images for
 * image-typed columns (durable, via the presigned-PUT path). Self-contained: the
 * `/decks/new` and `/decks/[id]/edit` pages mount it; it owns its save (POST / PUT).
 */
import { parseSheet } from '@doot-games/games'
import { computed, ref } from 'vue'

type ColType = 'text' | 'image' | 'number'
interface Column {
  key: string
  label: string
  type: ColType
}
type Row = Record<string, string | number | null>
type Kind = 'generic' | 'quiz' | 'prompt' | 'card'

interface InitialDeck {
  id: string
  name: string
  description: string | null
  kind: Kind
  visibility: 'private' | 'unlisted' | 'public'
  remixable: boolean
  columns: Column[]
  rows: Row[]
}
const props = defineProps<{ initial?: InitialDeck }>()

const uploadImage = useImageUpload()

const deckId = ref<string | null>(props.initial?.id ?? null)
const name = ref(props.initial?.name ?? '')
const description = ref(props.initial?.description ?? '')
const kind = ref<Kind>(props.initial?.kind ?? 'generic')
const visibility = ref<'private' | 'unlisted' | 'public'>(props.initial?.visibility ?? 'private')
const remixable = ref(props.initial?.remixable ?? false)
const columns = ref<Column[]>(props.initial?.columns?.length ? props.initial.columns : [{ key: 'col1', label: 'Column 1', type: 'text' }])
const rows = ref<Row[]>(props.initial?.rows ?? [])

const KINDS: Array<{ id: Kind; label: string; hint: string }> = [
  { id: 'generic', label: 'Generic', hint: 'Any columns. Bind fields to it from any round.' },
  { id: 'quiz', label: 'Quiz', hint: 'Question + answer columns for guess / buzzer rounds.' },
  { id: 'prompt', label: 'Prompt', hint: 'A column of prompts / dares for spotlight & writing games.' },
  { id: 'card', label: 'Card', hint: 'Freeform cards (for the upcoming card-game system).' },
]

// ── Columns ────────────────────────────────────────────────────────────────
function slug(s: string, fallback: string): string {
  const k = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return k || fallback
}
function addColumn() {
  const n = columns.value.length + 1
  let key = `col${n}`
  const taken = new Set(columns.value.map((c) => c.key))
  let i = n
  while (taken.has(key)) key = `col${++i}`
  columns.value = [...columns.value, { key, label: `Column ${n}`, type: 'text' }]
}
function removeColumn(key: string) {
  if (columns.value.length <= 1) return
  columns.value = columns.value.filter((c) => c.key !== key)
  rows.value = rows.value.map((r) => {
    const { [key]: _drop, ...rest } = r
    return rest
  })
}

// ── Rows ───────────────────────────────────────────────────────────────────
function addRow() {
  const blank: Row = {}
  for (const c of columns.value) blank[c.key] = c.type === 'number' ? 0 : ''
  rows.value = [...rows.value, blank]
}
function removeRow(i: number) {
  rows.value = rows.value.filter((_, idx) => idx !== i)
}
function setCell(i: number, key: string, value: string | number | null) {
  rows.value = rows.value.map((r, idx) => (idx === i ? { ...r, [key]: value } : r))
}

const uploading = ref<string | null>(null) // `${rowIndex}:${key}` while a cell uploads
async function onImagePick(i: number, key: string, e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const slot = `${i}:${key}`
  uploading.value = slot
  try {
    const url = await uploadImage(file)
    setCell(i, key, url)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Image upload failed.'
  } finally {
    uploading.value = null
  }
}

// ── Import ───────────────────────────────────────────────────────────────────
const importing = ref(false)
const pasteText = ref('')
const preview = ref<ReturnType<typeof parseSheet> | null>(null)
function doPreview() {
  preview.value = parseSheet(pasteText.value)
}
function applyImport(mode: 'replace' | 'append') {
  const p = preview.value
  if (!p || !p.columns.length) return
  if (mode === 'replace') {
    columns.value = p.columns
    rows.value = p.rows
  } else {
    // Append: keep current columns, map imported rows by matching key.
    rows.value = [...rows.value, ...p.rows]
    // Add any new columns the import introduces.
    const have = new Set(columns.value.map((c) => c.key))
    for (const c of p.columns) if (!have.has(c.key)) columns.value.push(c)
  }
  importing.value = false
  pasteText.value = ''
  preview.value = null
}

// ── Save ───────────────────────────────────────────────────────────────────
const saving = ref(false)
const error = ref<string | null>(null)
const canSave = computed(() => name.value.trim().length > 0 && columns.value.length > 0)

function body() {
  return {
    name: name.value.trim(),
    description: description.value.trim() || undefined,
    kind: kind.value,
    visibility: visibility.value,
    remixable: remixable.value,
    columns: columns.value,
    rows: rows.value,
  }
}
async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    if (deckId.value) {
      await $fetch(`/api/decks/${deckId.value}`, { method: 'PUT', body: body() })
    } else {
      const res = await $fetch<{ id: string }>('/api/decks', { method: 'POST', body: body() })
      deckId.value = res.id
      await navigateTo(`/decks/${res.id}/edit`)
      return
    }
    await navigateTo('/decks')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save the deck.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="de">
    <div class="de-meta">
      <label class="de-field">
        <span class="de-label">Deck name</span>
        <input v-model="name" class="de-input" placeholder="e.g. World capitals" maxlength="120" />
      </label>
      <label class="de-field">
        <span class="de-label">Description <small>(optional)</small></span>
        <input v-model="description" class="de-input" placeholder="One line shown on the card" maxlength="300" />
      </label>

      <div class="de-field">
        <span class="de-label">Kind</span>
        <div class="de-kinds">
          <button v-for="k in KINDS" :key="k.id" type="button" class="de-kind" :class="{ on: kind === k.id }" :title="k.hint" @click="kind = k.id">{{ k.label }}</button>
        </div>
        <small class="de-hint">{{ KINDS.find((k) => k.id === kind)?.hint }}</small>
      </div>

      <div class="de-row2">
        <label class="de-field">
          <span class="de-label">Visibility</span>
          <select v-model="visibility" class="de-input">
            <option value="private">Private (only you)</option>
            <option value="unlisted">Unlisted (anyone with the link)</option>
            <option value="public">Public (listed in the library)</option>
          </select>
        </label>
        <label class="de-check">
          <input v-model="remixable" type="checkbox" />
          <span>Let others copy this deck</span>
        </label>
      </div>
    </div>

    <div class="de-toolbar">
      <strong>{{ rows.length }} row{{ rows.length === 1 ? '' : 's' }} · {{ columns.length }} column{{ columns.length === 1 ? '' : 's' }}</strong>
      <div class="de-tools">
        <button type="button" class="btn btn-ghost btn-sm" @click="importing = !importing">Import spreadsheet</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="addColumn">+ Column</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="addRow">+ Row</button>
      </div>
    </div>

    <div v-if="importing" class="de-import">
      <p class="de-label">Paste CSV or a copy from Google Sheets / Excel (first row = headers)</p>
      <textarea v-model="pasteText" class="de-textarea" rows="5" placeholder="country, capital, flag&#10;France, Paris, https://…/fr.png" @input="preview = null" />
      <div class="de-import-actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!pasteText.trim()" @click="doPreview">Preview</button>
        <template v-if="preview && preview.columns.length">
          <button type="button" class="btn btn-primary btn-sm" @click="applyImport('replace')">Replace all</button>
          <button v-if="rows.length" type="button" class="btn btn-ghost btn-sm" @click="applyImport('append')">Append rows</button>
        </template>
        <button type="button" class="btn btn-ghost btn-sm" @click="importing = false">Cancel</button>
      </div>
      <div v-if="preview" class="de-preview">
        <p v-if="!preview.columns.length" class="de-err">Couldn’t parse a header + rows. Check the paste.</p>
        <p v-else class="de-ok">{{ preview.rows.length }} row{{ preview.rows.length === 1 ? '' : 's' }} · columns: {{ preview.columns.map((c) => c.key).join(', ') }}</p>
        <ul v-if="preview.errors.length" class="de-errs"><li v-for="(e, i) in preview.errors.slice(0, 5)" :key="i">{{ e }}</li></ul>
      </div>
    </div>

    <div class="de-grid-wrap">
      <table class="de-grid">
        <thead>
          <tr>
            <th class="de-rownum" />
            <th v-for="c in columns" :key="c.key" class="de-th">
              <input v-model="c.label" class="de-colname" :placeholder="c.key" />
              <div class="de-colctl">
                <select v-model="c.type" class="de-coltype">
                  <option value="text">text</option>
                  <option value="image">image</option>
                  <option value="number">number</option>
                </select>
                <button type="button" class="de-colx" :disabled="columns.length <= 1" aria-label="Remove column" @click="removeColumn(c.key)">✕</button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td class="de-rownum">
              <button type="button" class="de-rowx" aria-label="Remove row" @click="removeRow(i)">✕</button>
              <span class="mono">{{ i + 1 }}</span>
            </td>
            <td v-for="c in columns" :key="c.key" class="de-td">
              <template v-if="c.type === 'image'">
                <div class="de-img">
                  <img v-if="r[c.key]" :src="String(r[c.key])" alt="" class="de-thumb" />
                  <label class="de-imgbtn">
                    {{ uploading === `${i}:${c.key}` ? '…' : r[c.key] ? 'Replace' : 'Upload' }}
                    <input type="file" accept="image/*" class="visually-hidden" @change="onImagePick(i, c.key, $event)" />
                  </label>
                  <input :value="r[c.key] ?? ''" class="de-cell de-cell-url" placeholder="or paste a URL" @input="setCell(i, c.key, ($event.target as HTMLInputElement).value)" />
                </div>
              </template>
              <input v-else-if="c.type === 'number'" type="number" :value="r[c.key] ?? ''" class="de-cell" @input="setCell(i, c.key, ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value))" />
              <input v-else :value="r[c.key] ?? ''" class="de-cell" @input="setCell(i, c.key, ($event.target as HTMLInputElement).value)" />
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 1" class="de-empty">No rows yet. <button type="button" class="de-link" @click="addRow">Add one</button> or import a spreadsheet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="de-foot">
      <p v-if="error" class="de-err">{{ error }}</p>
      <div class="de-foot-actions">
        <NuxtLink to="/decks" class="btn btn-ghost btn-sm">Cancel</NuxtLink>
        <button type="button" class="btn btn-primary" :disabled="!canSave || saving" @click="save">{{ saving ? 'Saving…' : deckId ? 'Save deck' : 'Create deck' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.de { display: flex; flex-direction: column; gap: 18px; }
.de-meta { display: flex; flex-direction: column; gap: 14px; }
.de-field { display: flex; flex-direction: column; gap: 5px; }
.de-label { font-size: 13px; font-weight: 700; color: var(--ink-soft); }
.de-label small { color: var(--mute); font-weight: 600; }
.de-hint { color: var(--mute); font-size: 12px; }
.de-input, .de-textarea { font: inherit; padding: 9px 11px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface); color: var(--ink); }
.de-textarea { resize: vertical; font-family: var(--font-mono); font-size: 13px; width: 100%; }
.de-row2 { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-end; }
.de-row2 .de-field { flex: 1; min-width: 220px; }
.de-check { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--ink); padding-bottom: 9px; }
.de-kinds { display: flex; gap: 7px; flex-wrap: wrap; }
.de-kind { border: var(--bd) solid var(--line-soft); background: var(--surface); border-radius: 999px; padding: 6px 14px; font-weight: 700; font-size: 13px; color: var(--ink-soft); cursor: pointer; font-family: inherit; }
.de-kind.on { background: var(--ink); color: var(--bg); border-color: var(--line); }
.de-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: var(--bd) solid var(--line-soft); padding-top: 14px; }
.de-toolbar strong { font-size: 14px; }
.de-tools { display: flex; gap: 8px; flex-wrap: wrap; }
.de-import { display: flex; flex-direction: column; gap: 9px; border: var(--bd) dashed var(--line); border-radius: var(--radius); padding: 12px; }
.de-import-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.de-preview { font-size: 13px; }
.de-ok { color: var(--ink-soft); margin: 0; }
.de-err { color: var(--primary); margin: 0; }
.de-errs { margin: 6px 0 0; padding-left: 18px; color: var(--mute); font-size: 12px; }
.de-grid-wrap { overflow-x: auto; border: var(--bd) solid var(--line-soft); border-radius: var(--radius); }
.de-grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.de-th { text-align: left; padding: 7px 8px; border-bottom: var(--bd) solid var(--line); border-left: var(--bd) solid var(--line-soft); vertical-align: top; min-width: 150px; background: var(--surface-2); }
.de-colname { font: inherit; font-weight: 800; width: 100%; border: none; background: none; color: var(--ink); padding: 0 0 3px; }
.de-colctl { display: flex; gap: 5px; align-items: center; }
.de-coltype { font: inherit; font-size: 11px; border: var(--bd) solid var(--line-soft); border-radius: 5px; background: var(--surface); color: var(--mute); padding: 1px 3px; }
.de-colx, .de-rowx { background: none; border: none; color: var(--mute); cursor: pointer; font-size: 12px; padding: 2px 4px; }
.de-colx:disabled { opacity: 0.3; cursor: default; }
.de-rownum { width: 44px; text-align: right; padding: 4px 6px; color: var(--mute); border-bottom: var(--bd) solid var(--line-soft); white-space: nowrap; }
.de-td { padding: 0; border-bottom: var(--bd) solid var(--line-soft); border-left: var(--bd) solid var(--line-soft); }
.de-cell { font: inherit; width: 100%; border: none; background: none; color: var(--ink); padding: 7px 8px; }
.de-cell:focus { outline: 2px solid var(--primary); outline-offset: -2px; }
.de-img { display: flex; align-items: center; gap: 6px; padding: 4px 6px; }
.de-thumb { width: 28px; height: 28px; object-fit: cover; border-radius: 4px; }
.de-imgbtn { font-size: 11px; font-weight: 700; color: var(--primary); cursor: pointer; white-space: nowrap; }
.de-cell-url { font-size: 11px; color: var(--mute); }
.de-empty { padding: 18px; text-align: center; color: var(--ink-soft); }
.de-link, .de-foot .de-err { background: none; border: none; color: var(--primary); font: inherit; font-weight: 700; cursor: pointer; }
.de-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.de-foot-actions { display: flex; gap: 10px; margin-left: auto; }
</style>
