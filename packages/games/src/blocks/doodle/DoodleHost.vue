<script setup lang="ts">
/**
 * Big-screen view for a doodle round. Shows ONLY the round prompt and progress, never
 * any player's drawing or text (each is secret to the player who holds it). The
 * control bar shows the "N/M done" count. At reveal it reads as a "passing along"
 * transition between rounds.
 */
import { computed } from 'vue'
import type { DoodleContent } from './block'

const props = defineProps<{
  content: DoodleContent
  inputs?: Map<string, unknown>
  state?: string
  answer?: unknown
}>()

const step = computed(() => props.content?.step ?? 1)
const total = computed(() => props.content?.total ?? 1)
const passing = computed(() => props.state === 'reveal')
const title = computed(() => {
  if (props.content?.seed) return 'Write a prompt'
  return props.content?.mode === 'draw' ? 'Draw it' : 'Guess the drawing'
})
const sub = computed(() => {
  if (props.content?.seed) return 'Everyone writes a prompt for someone else to draw.'
  return props.content?.mode === 'draw'
    ? 'Each player got a prompt and draws it on their phone, seeing only that prompt.'
    : 'Each player got a drawing and writes what they think it is.'
})
</script>

<template>
  <div class="doodle-host">
    <div class="step">Round {{ step }} of {{ total }}</div>
    <template v-if="passing">
      <div class="glyph" aria-hidden="true">~</div>
      <h2 class="title">Passing your doodles along...</h2>
      <p class="sub">Each chain moves one seat. The next player builds on what just got made.</p>
    </template>
    <template v-else>
      <div class="glyph" aria-hidden="true">{{ content?.mode === 'draw' ? '✎' : '?' }}</div>
      <h2 class="title">{{ title }}</h2>
      <p class="sub">{{ sub }}</p>
    </template>
  </div>
</template>

<style scoped>
.doodle-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14px;
  padding: 24px 16px;
  color: var(--primary);
}
.glyph {
  font-size: clamp(48px, 10vw, 96px);
  font-weight: 900;
  line-height: 0.7;
  color: var(--primary);
}
.step {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
  font-size: clamp(13px, 2vw, 16px);
}
.title {
  margin: 0;
  font-size: clamp(28px, 6vw, 52px);
  font-weight: 900;
  color: var(--ink);
  line-height: 1.05;
}
.sub {
  margin: 0;
  max-width: 36ch;
  color: var(--ink-soft);
  font-size: clamp(15px, 2.4vw, 20px);
  line-height: 1.4;
}
</style>
