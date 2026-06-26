<script setup lang="ts">
/**
 * Custom round editor for a Tier round. The auto-generated schema form can't make
 * "add a dozen items" pleasant, and tier lists live or die on that, so this is a
 * purpose-built builder:
 *   - BULK ADD: paste a list (one item per line) and they all become items at once.
 *   - per-item image (URL or upload), reorder, remove.
 *   - the tier bands: rename, recolour, reorder, or apply a preset (Classic, S–F, Hot/Cold).
 *
 * It emits a whole TierContent on every change (same contract as SchemaForm), so the
 * editor stores and validates it exactly like any other block.
 */
import { ImageField } from '@doot-games/ui'
import { computed, ref } from 'vue'
import type { TierContent } from './block'
import { DEFAULT_TIERS } from './logic'

// Use the schema-derived shapes (image/color are required strings here) so what the
// editor builds matches what the block stores exactly.
type EItem = TierContent['items'][number]
type ETier = TierContent['tiers'][number]

const props = defineProps<{ modelValue: TierContent }>()
const emit = defineEmits<{ 'update:modelValue': [value: TierContent] }>()

const MAX_ITEMS = 24
const MAX_TIERS = 8
const c = computed(() => props.modelValue)
const bulk = ref('')
const openImage = ref<Set<string>>(new Set())

function patch(p: Partial<TierContent>) {
  emit('update:modelValue', { ...c.value, ...p })
}

// ── items ────────────────────────────────────────────────────────────────────
function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'item'
  )
}
function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  taken.add(id)
  return id
}
function addBulk() {
  const lines = bulk.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!lines.length) return
  const taken = new Set(c.value.items.map((i) => i.id))
  const room = MAX_ITEMS - c.value.items.length
  const next: EItem[] = lines.slice(0, room).map((label) => ({ id: uniqueId(slug(label), taken), label: label.slice(0, 60), image: '' }))
  if (next.length) patch({ items: [...c.value.items, ...next] })
  bulk.value = ''
}
function setItem(i: number, p: Partial<EItem>) {
  const items = c.value.items.map((it, j) => (j === i ? { ...it, ...p } : it))
  patch({ items })
}
function removeItem(i: number) {
  if (c.value.items.length <= 2) return
  patch({ items: c.value.items.filter((_, j) => j !== i) })
}
function moveItem(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= c.value.items.length) return
  const items = [...c.value.items]
  ;[items[i], items[j]] = [items[j]!, items[i]!]
  patch({ items })
}
function toggleImage(id: string) {
  const s = new Set(openImage.value)
  s.has(id) ? s.delete(id) : s.add(id)
  openImage.value = s
}

// ── tiers ────────────────────────────────────────────────────────────────────
const PRESETS: Record<string, ETier[]> = {
  'Classic S–D': DEFAULT_TIERS,
  'S to F': [
    { label: 'S', color: '#ff6b6b' },
    { label: 'A', color: '#ffa94d' },
    { label: 'B', color: '#ffd43b' },
    { label: 'C', color: '#69db7c' },
    { label: 'D', color: '#4dabf7' },
    { label: 'F', color: '#b197fc' },
  ],
  'Hot / Cold': [
    { label: 'Love it', color: '#ff6b6b' },
    { label: 'Like it', color: '#ffa94d' },
    { label: 'Meh', color: '#ffd43b' },
    { label: 'Nope', color: '#4dabf7' },
  ],
}
function applyPreset(key: string) {
  patch({ tiers: (PRESETS[key] ?? DEFAULT_TIERS).map((t) => ({ ...t })) })
}
function setTier(i: number, p: Partial<ETier>) {
  patch({ tiers: c.value.tiers.map((t, j) => (j === i ? { ...t, ...p } : t)) })
}
function addTier() {
  if (c.value.tiers.length >= MAX_TIERS) return
  const fallback = DEFAULT_TIERS[c.value.tiers.length % DEFAULT_TIERS.length]!
  patch({ tiers: [...c.value.tiers, { label: 'New', color: fallback.color }] })
}
function removeTier(i: number) {
  if (c.value.tiers.length <= 2) return
  patch({ tiers: c.value.tiers.filter((_, j) => j !== i) })
}
function moveTier(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= c.value.tiers.length) return
  const tiers = [...c.value.tiers]
  ;[tiers[i], tiers[j]] = [tiers[j]!, tiers[i]!]
  patch({ tiers })
}
function colorOf(t: ETier, i: number): string {
  return t.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || '#888888'
}

const timerOn = computed(() => c.value.timer != null)
</script>

<template>
  <div class="tier-editor">
    <!-- Prompt -->
    <label class="te-field">
      <span class="te-label">Prompt</span>
      <input
        class="sf-input"
        type="text"
        maxlength="400"
        :value="c.prompt"
        placeholder="Tier these…"
        @input="patch({ prompt: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <!-- Items -->
    <section class="te-section">
      <div class="te-section-head">
        <span class="te-label">Items to tier</span>
        <span class="te-count mono">{{ c.items.length }}/{{ MAX_ITEMS }}</span>
      </div>
      <ol class="te-items">
        <li v-for="(item, i) in c.items" :key="item.id" class="te-item">
          <div class="te-item-row">
            <input
              class="sf-input te-item-label"
              type="text"
              maxlength="60"
              :value="item.label"
              placeholder="Item name"
              @input="setItem(i, { label: ($event.target as HTMLInputElement).value })"
            />
            <button type="button" class="te-mini" :class="{ on: openImage.has(item.id) || item.image }" :aria-pressed="openImage.has(item.id)" title="Add a picture" @click="toggleImage(item.id)">Image</button>
            <button type="button" class="te-mini" :disabled="i === 0" aria-label="Move up" @click="moveItem(i, -1)">↑</button>
            <button type="button" class="te-mini" :disabled="i === c.items.length - 1" aria-label="Move down" @click="moveItem(i, 1)">↓</button>
            <button type="button" class="te-mini danger" :disabled="c.items.length <= 2" aria-label="Remove item" @click="removeItem(i)">✕</button>
          </div>
          <div v-if="openImage.has(item.id) || item.image" class="te-item-img">
            <ImageField :model-value="item.image ?? ''" label="" @update:model-value="setItem(i, { image: $event })" />
          </div>
        </li>
      </ol>
      <div class="te-bulk">
        <textarea
          v-model="bulk"
          class="sf-input te-bulk-input"
          rows="2"
          :placeholder="`Paste items, one per line (${MAX_ITEMS - c.items.length} slots left)`"
          @keydown.ctrl.enter.prevent="addBulk"
          @keydown.meta.enter.prevent="addBulk"
        />
        <button type="button" class="btn btn-primary te-add" :disabled="!bulk.trim() || c.items.length >= MAX_ITEMS" @click="addBulk">
          Add
        </button>
      </div>
    </section>

    <!-- Tiers -->
    <section class="te-section">
      <div class="te-section-head">
        <span class="te-label">Tiers</span>
        <span class="te-presets">
          <button v-for="key in Object.keys(PRESETS)" :key="key" type="button" class="te-preset" @click="applyPreset(key)">{{ key }}</button>
        </span>
      </div>
      <ol class="te-tiers">
        <li v-for="(tier, i) in c.tiers" :key="i" class="te-tier" :style="{ '--tc': colorOf(tier, i) }">
          <input
            type="color"
            class="te-swatch"
            :value="colorOf(tier, i)"
            aria-label="Tier colour"
            @input="setTier(i, { color: ($event.target as HTMLInputElement).value })"
          />
          <input
            class="sf-input te-tier-label"
            type="text"
            maxlength="18"
            :value="tier.label"
            placeholder="Tier"
            @input="setTier(i, { label: ($event.target as HTMLInputElement).value })"
          />
          <button type="button" class="te-mini" :disabled="i === 0" aria-label="Move up" @click="moveTier(i, -1)">↑</button>
          <button type="button" class="te-mini" :disabled="i === c.tiers.length - 1" aria-label="Move down" @click="moveTier(i, 1)">↓</button>
          <button type="button" class="te-mini danger" :disabled="c.tiers.length <= 2" aria-label="Remove tier" @click="removeTier(i)">✕</button>
        </li>
      </ol>
      <button type="button" class="btn btn-ghost te-add-tier" :disabled="c.tiers.length >= MAX_TIERS" @click="addTier">+ Add tier</button>
    </section>

    <!-- Options -->
    <section class="te-options">
      <label class="te-opt">
        <input type="checkbox" :checked="timerOn" @change="patch({ timer: ($event.target as HTMLInputElement).checked ? 60 : null })" />
        <span>Timed</span>
        <input
          v-if="timerOn"
          class="sf-input te-timer"
          type="number"
          min="5"
          max="600"
          :value="c.timer ?? 60"
          @input="patch({ timer: Math.max(5, Number(($event.target as HTMLInputElement).value) || 60) })"
        />
        <span v-if="timerOn" class="te-opt-unit">sec</span>
      </label>
      <label class="te-opt">
        <input type="checkbox" :checked="c.liveConsensus" @change="patch({ liveConsensus: ($event.target as HTMLInputElement).checked })" />
        <span>Show the board forming live</span>
      </label>
      <label class="te-opt">
        <input type="checkbox" :checked="c.scored" @change="patch({ scored: ($event.target as HTMLInputElement).checked })" />
        <span>Score "match the room"</span>
      </label>
    </section>
  </div>
</template>

<style scoped>
.tier-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.te-field,
.te-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.te-label {
  font-weight: 700;
  font-size: 13px;
}
.te-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.te-count {
  color: var(--mute);
  font-size: 12px;
  font-weight: 700;
}
.te-items,
.te-tiers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.te-item {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 10px;
  padding: 7px;
}
.te-item-row,
.te-tier {
  display: flex;
  align-items: center;
  gap: 6px;
}
.te-item-label {
  flex: 1;
  min-width: 0;
}
.te-item-img {
  margin-top: 7px;
}
.te-tier {
  background: color-mix(in srgb, var(--tc) 10%, var(--surface-2));
  border: var(--bd) solid color-mix(in srgb, var(--tc) 30%, var(--line-soft));
  border-radius: 10px;
  padding: 6px 8px;
}
.te-swatch {
  flex: none;
  width: 34px;
  height: 34px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 8px;
  padding: 0;
  background: none;
  cursor: pointer;
}
.te-tier-label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
}
.te-mini {
  flex: none;
  min-width: 34px;
  height: 34px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}
.te-mini.on {
  border-color: var(--primary);
  color: var(--primary);
}
.te-mini.danger:hover:not(:disabled) {
  border-color: var(--danger, #c0392b);
  color: var(--danger, #c0392b);
}
.te-mini:disabled {
  opacity: 0.4;
  cursor: default;
}
.te-bulk {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.te-bulk-input {
  flex: 1;
  resize: vertical;
  font-family: inherit;
}
.te-add {
  flex: none;
}
.te-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.te-preset {
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink-soft);
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.te-preset:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.te-add-tier {
  align-self: flex-start;
}
.te-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: var(--bd) solid var(--line-soft);
  padding-top: 14px;
}
.te-opt {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 600;
  font-size: 14px;
}
.te-timer {
  width: 72px;
}
.te-opt-unit {
  color: var(--mute);
  font-size: 13px;
}
</style>
