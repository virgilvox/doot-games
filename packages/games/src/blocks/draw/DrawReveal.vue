<script setup lang="ts">
/**
 * Phone reveal for a Draw round: shows the player their OWN drawing back on their
 * phone ("here's what you made"), so the second-screen player gets a little payoff
 * even though the shared gallery lives on the big screen.
 */
import { DrawThumb } from '@doot-games/ui'
import type { DrawValue } from '@doot-games/ui'
import { computed } from 'vue'
import type { DrawContent } from './block'

const props = defineProps<{
  content: DrawContent
  myInput?: DrawValue | null
  reveal?: unknown
}>()

const drew = computed(() => Array.isArray(props.myInput?.strokes) && props.myInput.strokes.length > 0)
</script>

<template>
  <div class="draw-reveal big" aria-live="polite">
    <template v-if="drew">
      <h2>Here's your drawing</h2>
      <div class="frame">
        <DrawThumb :value="myInput as DrawValue" :aspect="content.aspect" label="Your drawing" />
      </div>
      <p>Check the big screen for the whole gallery.</p>
    </template>
    <template v-else>
      <div class="badge" aria-hidden="true">&#9999;</div>
      <h2>No drawing</h2>
      <p>You didn't draw this round. Catch the gallery on the big screen.</p>
    </template>
  </div>
</template>

<style scoped>
.draw-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}
.draw-reveal h2 { font-size: clamp(24px, 6vw, 34px); font-weight: 800; }
.draw-reveal p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.frame {
  width: min(320px, 80%);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  background: #fff;
}
.badge {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
}
</style>
