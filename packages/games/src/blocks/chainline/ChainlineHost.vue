<script setup lang="ts">
/**
 * Big-screen view for a chain round. It shows ONLY the round prompt and progress,
 * never any player's line (each line is secret to the player who holds it). The
 * control bar already shows the "N/M written" count. At the reveal beat it reads as
 * a thematic "passing the stories along" transition between rounds.
 */
import { computed } from 'vue'
import type { ChainlineContent } from './block'

const props = defineProps<{
  content: ChainlineContent
  inputs?: Map<string, unknown>
  state?: string
  answer?: unknown
}>()

const isSeed = computed(() => props.content?.seed === true)
const step = computed(() => props.content?.step ?? 1)
const total = computed(() => props.content?.total ?? 1)
const passing = computed(() => props.state === 'reveal')
</script>

<template>
  <div class="chain-host">
    <div class="step">Line {{ step }} of {{ total }}</div>

    <template v-if="passing">
      <div class="glyph" aria-hidden="true">~</div>
      <h2 class="title">Passing your stories along...</h2>
      <p class="sub">Each story moves one seat. The next line builds on what just got written.</p>
    </template>
    <template v-else>
      <div class="glyph" aria-hidden="true">&ldquo;&rdquo;</div>
      <h2 class="title">{{ isSeed ? 'Start a story' : 'Continue the story' }}</h2>
      <p class="sub">
        {{ isSeed
          ? 'Everyone writes an opening line on their phone.'
          : 'Each player got one line and writes what comes next, seeing only that line.' }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.chain-host {
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
  line-height: 0.6;
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
