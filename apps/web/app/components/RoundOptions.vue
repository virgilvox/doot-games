<script setup lang="ts">
/**
 * Per-round authoring options that aren't part of the block's content: whether the
 * round shows in the final results, whether its "standings so far" peek shows, and
 * which named section it belongs to (with combine-ratings for a section of rate
 * rounds). Purely presentational, the editor owns the group CRUD and applies the
 * emitted intents, so this component never mutates the composition directly.
 */
import type { GroupDef, RoundInstance } from '@doot-games/sdk'
import { computed } from 'vue'

const props = defineProps<{
  round: RoundInstance
  groups: GroupDef[]
  /** A display block (slide/title) doesn't score, so results/standings toggles hide. */
  isDisplay: boolean
  /** Combine-ratings only makes sense when the game has rate rounds. */
  hasRateRounds: boolean
}>()
const emit = defineEmits<{
  'set-flag': [payload: { key: 'inResults' | 'showStandings'; on: boolean }]
  'set-group': [groupId: string]
  'rename-group': [payload: { id: string; name: string }]
  'toggle-combine': [payload: { id: string; on: boolean }]
}>()

const currentGroup = computed(() =>
  props.round.group ? props.groups.find((g) => g.id === props.round.group) : undefined,
)
</script>

<template>
  <div class="ed-round-opts">
    <span class="ed-bind-label">Round options</span>
    <template v-if="!isDisplay">
      <label class="ed-ropt">
        <input
          type="checkbox"
          :checked="round.inResults !== false"
          @change="emit('set-flag', { key: 'inResults', on: ($event.target as HTMLInputElement).checked })"
        />
        <span>Show in the final results</span>
      </label>
      <label class="ed-ropt">
        <input
          type="checkbox"
          :checked="round.showStandings !== false"
          @change="emit('set-flag', { key: 'showStandings', on: ($event.target as HTMLInputElement).checked })"
        />
        <span>Show "standings so far" after this round</span>
      </label>
    </template>
    <div class="ed-ropt-row">
      <label class="ed-ropt-lbl" for="ro-group">Section</label>
      <select
        id="ro-group"
        class="sf-select"
        :value="round.group ?? ''"
        @change="emit('set-group', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">None</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        <option value="__new__">New section…</option>
      </select>
    </div>
    <template v-if="currentGroup">
      <input
        class="sf-input ed-group-name"
        :value="currentGroup.name"
        aria-label="Section name"
        maxlength="120"
        placeholder="Section name"
        @input="emit('rename-group', { id: currentGroup.id, name: ($event.target as HTMLInputElement).value })"
      />
      <label v-if="hasRateRounds" class="ed-ropt">
        <input
          type="checkbox"
          :checked="!!currentGroup.combineRatings"
          @change="emit('toggle-combine', { id: currentGroup!.id, on: ($event.target as HTMLInputElement).checked })"
        />
        <span>Combine the ratings in this section into one ranking</span>
      </label>
    </template>
  </div>
</template>

<style scoped>
.ed-round-opts {
  margin-top: 18px;
  padding-top: 16px;
  border-top: var(--bd) solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ed-bind-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
}
.ed-ropt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
}
.ed-ropt input[type='checkbox'] {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: var(--primary);
  cursor: pointer;
}
.ed-ropt-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ed-ropt-lbl {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  min-width: 80px;
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
.ed-group-name {
  width: 100%;
}
</style>
