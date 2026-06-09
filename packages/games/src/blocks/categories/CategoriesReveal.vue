<script setup lang="ts">
/**
 * Phone reveal for a Categories round: shows the player their own answers with a
 * tick (valid + unique = scored), a strike (a duplicate someone else also said),
 * or a cross (didn't start with the letter), plus their round score. Computed from
 * the player's own input + the published (anonymized) breakdown, so no pid needed.
 */
import { computed } from 'vue'
import { normalizeAnswer } from '../text-match'
import type { CategoriesContent, CategoriesInput } from './logic'
import { startsWithLetter } from './logic'

interface RevealCat {
  id: string
  label: string
  answers: Array<{ text: string; valid: boolean; unique: boolean; scored: boolean }>
}
interface Reveal {
  letter: string
  categories: RevealCat[]
}

const props = defineProps<{
  content: CategoriesContent
  myInput?: CategoriesInput | null
  reveal?: Reveal | null
}>()

const rows = computed(() => {
  const letter = props.reveal?.letter ?? props.content.letter
  return props.content.categories.map((cat) => {
    const mine = (props.myInput?.answers?.[cat.id] ?? '').trim()
    const valid = startsWithLetter(mine, letter)
    // Match my answer in the published breakdown to learn if it was unique.
    const key = valid ? normalizeAnswer(mine) : ''
    const hit = props.reveal?.categories
      .find((c) => c.id === cat.id)
      ?.answers.find((a) => normalizeAnswer(a.text) === key)
    const scored = valid && !!hit?.scored
    return { label: cat.label, text: mine, valid, scored }
  })
})
const total = computed(() => rows.value.filter((r) => r.scored).length)
</script>

<template>
  <div class="cats-reveal big" aria-live="polite">
    <h2>You scored {{ total }}</h2>
    <ul class="myrows">
      <li v-for="(r, i) in rows" :key="i" :class="{ scored: r.scored }">
        <span class="mr-cat">{{ r.label }}</span>
        <span class="mr-ans">{{ r.text || 'no answer' }}</span>
        <span class="mr-mark" aria-hidden="true">
          <template v-if="r.scored">&#10003;</template>
          <template v-else-if="r.text && r.valid">dup</template>
          <template v-else-if="r.text">&#10007;</template>
          <template v-else>&#8211;</template>
        </span>
      </li>
    </ul>
    <p class="foot">A unique answer that starts with the letter scores. Matching someone else scores nothing.</p>
  </div>
</template>

<style scoped>
.cats-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}
.cats-reveal h2 {
  font-size: clamp(26px, 7vw, 36px);
  font-weight: 800;
}
.myrows {
  list-style: none;
  display: grid;
  gap: 8px;
  width: 100%;
  max-width: 360px;
}
.myrows li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 14px;
  text-align: left;
}
.myrows li.scored {
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 12%, var(--surface-2));
}
.mr-cat {
  font-size: 12px;
  font-weight: 800;
  color: var(--ink-soft);
}
.mr-ans {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.mr-mark {
  font-weight: 800;
  font-size: 13px;
  color: var(--ink-soft);
}
.myrows li.scored .mr-mark {
  color: var(--c5);
  font-size: 18px;
}
.foot {
  color: var(--ink-soft);
  max-width: 32ch;
  line-height: 1.45;
  font-size: 14px;
}
</style>
