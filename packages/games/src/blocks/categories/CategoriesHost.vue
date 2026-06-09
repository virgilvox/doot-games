<script setup lang="ts">
/**
 * Big-screen Categories view. While players type it shows the big letter + the
 * category list + a count (showing answers would let people copy). At reveal it
 * lists every answer per category, highlighting the ones that scored (valid +
 * unique), greying duplicates, and marking invalid ones.
 */
import type { RoundState } from '@doot-games/engine'
import { computed } from 'vue'
import { type CategoriesContent, type CategoriesInput, scoreCategories } from './logic'

const props = defineProps<{
  content: CategoriesContent
  inputs: Map<string, CategoriesInput>
  state: RoundState
  answer?: unknown
}>()

const done = computed(() => props.state === 'reveal')
const letter = computed(() => (props.content.letter || '?').toUpperCase())
const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (v?.answers && Object.values(v.answers).some((a) => a?.trim())) n++
  return n
})
const breakdown = computed(() => scoreCategories(props.content, props.inputs).breakdown)
</script>

<template>
  <div class="cats-host">
    <div class="big-letter" aria-hidden="true">{{ letter }}</div>
    <template v-if="!done">
      <ul class="cat-list">
        <li v-for="c in content.categories" :key="c.id">{{ c.label }}</li>
      </ul>
      <p class="hint">{{ count }} {{ count === 1 ? 'player' : 'players' }} answering…</p>
    </template>
    <template v-else>
      <div class="reveal-grid">
        <div v-for="b in breakdown" :key="b.id" class="cat-block">
          <h4>{{ b.label }}</h4>
          <ul class="ans">
            <li
              v-for="(e, i) in b.entries"
              :key="i"
              :class="{ scored: e.scored, dup: e.valid && !e.unique, bad: !e.valid }"
            >
              {{ e.text }}
            </li>
          </ul>
          <p v-if="!b.entries.length" class="empty">none yet</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cats-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-height: 220px;
}
.big-letter {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(64px, 16vw, 160px);
  line-height: 1;
  color: var(--primary);
}
.cat-list {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.cat-list li {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 700;
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
.reveal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  width: min(900px, 96%);
}
.cat-block {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.cat-block h4 {
  font-weight: 800;
  margin-bottom: 8px;
  color: var(--ink-soft);
}
.ans {
  list-style: none;
  display: grid;
  gap: 5px;
}
.ans li {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.ans li.scored {
  color: var(--c5);
}
.ans li.dup {
  color: var(--mute);
  text-decoration: line-through;
}
.ans li.bad {
  color: var(--mute);
  font-style: italic;
}
.empty {
  color: var(--mute);
}
</style>
