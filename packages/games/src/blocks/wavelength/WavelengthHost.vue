<script setup lang="ts">
/**
 * Big-screen Wavelength view. The clue round shows only that a clue is being written
 * (never the target). The guess round shows the clue while the room places their dials,
 * then at reveal plots every guess against the now-revealed target (from the published
 * reveal summary, so the screen and phones agree).
 */
import type { RoundState } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import { SpectrumDial } from '@doot-games/ui'
import { computed } from 'vue'
import type { WavelengthContent, WavelengthRevealSummary } from './block'

const props = defineProps<{
  content: WavelengthContent & { clue?: string }
  inputs: Map<string, unknown>
  state: RoundState
  answer?: unknown
}>()

const room = injectDootRoom()
const isClue = computed(() => props.content?.phase === 'clue')
const revealed = computed(() => props.state === 'reveal')
const left = computed(() => props.content?.leftLabel ?? '')
const right = computed(() => props.content?.rightLabel ?? '')
const clue = computed(() => props.content?.clue ?? '')
const placed = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (typeof (v as { value?: number })?.value === 'number') n++
  return n
})
const summary = computed(
  () => room.roundRevealFor(room.round.value.index) as WavelengthRevealSummary | undefined,
)
</script>

<template>
  <div class="wl-host">
    <template v-if="isClue">
      <div class="glyph" aria-hidden="true">?</div>
      <h2 class="title">A clue is brewing</h2>
      <p class="sub">One player can see a secret target on the spectrum and is writing a clue. Everyone else guesses next.</p>
    </template>

    <template v-else-if="revealed && summary">
      <div class="clue-banner">"{{ summary.clue }}" <span class="by">by {{ summary.clueGiver }}</span></div>
      <SpectrumDial
        :left-label="summary.leftLabel"
        :right-label="summary.rightLabel"
        :mean="summary.target"
        :marks="summary.guesses.map((g) => g.value)"
        readonly
      />
      <p class="result">The target was <strong>{{ summary.target }}</strong>. The clue earned <strong>{{ summary.clueGiverPoints }}</strong>.</p>
    </template>

    <template v-else>
      <div class="clue-banner">"{{ clue || '...' }}"</div>
      <SpectrumDial :left-label="left" :right-label="right" :marks="[]" readonly />
      <p class="sub">{{ placed }} placed. Where does the clue land?</p>
    </template>
  </div>
</template>

<style scoped>
.wl-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 16px;
}
.glyph {
  font-size: clamp(48px, 10vw, 96px);
  font-weight: 900;
  line-height: 0.7;
  color: var(--primary);
}
.title {
  margin: 0;
  font-size: clamp(28px, 6vw, 52px);
  font-weight: 900;
  color: var(--ink);
}
.sub {
  margin: 0;
  max-width: 40ch;
  color: var(--ink-soft);
  font-size: clamp(15px, 2.4vw, 20px);
  line-height: 1.4;
}
.clue-banner {
  font-size: clamp(24px, 5vw, 44px);
  font-weight: 900;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.by {
  font-size: clamp(15px, 2.4vw, 22px);
  font-weight: 700;
  color: var(--ink-soft);
}
.result {
  margin: 0;
  font-size: clamp(16px, 2.6vw, 22px);
  color: var(--ink);
}
.wl-host :deep(.spectrum-dial),
.wl-host :deep(.dial) {
  width: 100%;
  max-width: 720px;
}
</style>
