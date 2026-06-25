<script setup lang="ts">
/**
 * Authored game-wide settings: the play defaults that seed the host lobby (timers,
 * auto-advance, sound, crowd votes, who-drives, content filter, teams, player cap)
 * plus the results page section order. Self-contained: it edits a `GameSettings`
 * value via v-model, emitting `undefined` when nothing is set so an untouched game
 * carries no settings object. The host can still override any of these live.
 */
import type { GameSettings, ResultsSection } from '@doot-games/sdk'
import { computed } from 'vue'

const props = defineProps<{ modelValue?: GameSettings }>()
const emit = defineEmits<{ 'update:modelValue': [value: GameSettings | undefined] }>()

const s = computed<GameSettings>(() => props.modelValue ?? {})

function set<K extends keyof GameSettings>(key: K, value: GameSettings[K] | null) {
  const next: GameSettings = { ...s.value }
  // Treat undefined/null/'' as "clear", so an untouched setting stays absent (the
  // platform default applies) and we never persist a redundant value.
  if (value === undefined || value === null || (value as unknown) === '') delete next[key]
  else next[key] = value
  emit('update:modelValue', Object.keys(next).length ? next : undefined)
}

const RESULTS_SECTIONS: Array<{ id: ResultsSection; label: string }> = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'teams', label: 'Team scores' },
  { id: 'awards', label: 'Top rated' },
  { id: 'breakdowns', label: 'Breakdowns' },
]
// The effective order: the author's chosen list first, then any section they didn't
// place, in the default order. Reorderable so they pick what the results open on.
const resultsOrder = computed<ResultsSection[]>(() => {
  const chosen = s.value.resultsOrder ?? []
  const rest = RESULTS_SECTIONS.map((x) => x.id).filter((id) => !chosen.includes(id))
  return [...chosen, ...rest]
})
function moveSection(id: ResultsSection, dir: -1 | 1) {
  const order = [...resultsOrder.value]
  const i = order.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  set('resultsOrder', order)
}
function sectionLabel(id: ResultsSection): string {
  return RESULTS_SECTIONS.find((x) => x.id === id)?.label ?? id
}
</script>

<template>
  <div class="gs">
    <p class="gs-note">Defaults for when you host. You can still change them in the lobby for one night.</p>

    <label class="gs-opt">
      <input type="checkbox" :checked="s.timers ?? true" @change="set('timers', ($event.target as HTMLInputElement).checked)" />
      <span>Round timers on</span>
    </label>
    <label class="gs-opt">
      <input type="checkbox" :checked="s.autoAdvance ?? true" @change="set('autoAdvance', ($event.target as HTMLInputElement).checked)" />
      <span>Advance when everyone has answered</span>
    </label>
    <label class="gs-opt">
      <input type="checkbox" :checked="s.sfx ?? true" @change="set('sfx', ($event.target as HTMLInputElement).checked)" />
      <span>Sound effects on the big screen</span>
    </label>
    <label class="gs-opt">
      <input type="checkbox" :checked="s.crowdVotes ?? false" @change="set('crowdVotes', ($event.target as HTMLInputElement).checked)" />
      <span>Let the crowd's votes count</span>
    </label>
    <label class="gs-opt">
      <input type="checkbox" :checked="s.firstToJoinDrives ?? false" @change="set('firstToJoinDrives', ($event.target as HTMLInputElement).checked)" />
      <span>Let the first to join drive</span>
    </label>

    <div class="gs-row">
      <label class="gs-lbl" for="gs-filter">Filter answers</label>
      <select id="gs-filter" class="sf-select" :value="s.contentFilter ?? 'off'" @change="set('contentFilter', ($event.target as HTMLSelectElement).value as GameSettings['contentFilter'])">
        <option value="off">Off</option>
        <option value="moderate">Moderate</option>
        <option value="strict">Strict</option>
      </select>
    </div>
    <div class="gs-row">
      <label class="gs-lbl" for="gs-teams">Teams</label>
      <select id="gs-teams" class="sf-select" :value="String(s.teams ?? 0)" @change="set('teams', Number(($event.target as HTMLSelectElement).value) || null)">
        <option value="0">Off</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
      </select>
    </div>
    <div class="gs-row">
      <label class="gs-lbl" for="gs-cap">Max players</label>
      <input
        id="gs-cap"
        type="number"
        min="1"
        inputmode="numeric"
        class="sf-input"
        :value="s.playerCap ?? ''"
        placeholder="No limit"
        @input="set('playerCap', Number(($event.target as HTMLInputElement).value) || null)"
      />
    </div>

    <div class="gs-order">
      <span class="gs-order-label">Results order (what shows first)</span>
      <ol class="gs-order-list">
        <li v-for="(id, i) in resultsOrder" :key="id" class="gs-order-item">
          <span class="gs-order-name">{{ i + 1 }}. {{ sectionLabel(id) }}</span>
          <span class="gs-order-ctl">
            <button type="button" class="sf-icon-btn" :disabled="i === 0" aria-label="Move up" @click="moveSection(id, -1)">↑</button>
            <button type="button" class="sf-icon-btn" :disabled="i === resultsOrder.length - 1" aria-label="Move down" @click="moveSection(id, 1)">↓</button>
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.gs {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 4px 2px 8px;
}
.gs-note {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.4;
}
.gs-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
}
.gs-opt input[type='checkbox'] {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: var(--primary);
  cursor: pointer;
}
.gs-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gs-lbl {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  min-width: 96px;
}
.sf-select,
.sf-input {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border-radius: 10px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-weight: 600;
}
.gs-order {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gs-order-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
}
.gs-order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gs-order-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 11px;
  border-radius: 9px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.gs-order-ctl {
  display: inline-flex;
  gap: 4px;
}
</style>
