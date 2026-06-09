<script setup lang="ts">
/**
 * Phone reveal for a Wavelength guess round: the now-revealed target, where you
 * landed, and your points. The clue-giver (who has no guess) just sees the result.
 */
import { SpectrumDial } from '@doot-games/ui'
import { computed } from 'vue'
import type { WavelengthInput, WavelengthRevealSummary } from './block'

const props = defineProps<{ content: unknown; myInput?: WavelengthInput; reveal?: WavelengthRevealSummary }>()

const mine = computed(() => (typeof props.myInput?.value === 'number' ? props.myInput.value : null))
const target = computed(() => props.reveal?.target ?? null)
const marks = computed(() => (mine.value != null ? [mine.value] : []))
</script>

<template>
  <div v-if="reveal" class="wl-reveal">
    <SpectrumDial
      :left-label="reveal.leftLabel"
      :right-label="reveal.rightLabel"
      :mean="target"
      :marks="marks"
      :mine="mine"
      readonly
    />
    <p class="line">
      The target was <strong>{{ reveal.target }}</strong>.
      <template v-if="mine != null"> You guessed <strong>{{ mine }}</strong>.</template>
      <template v-else> You gave the clue "{{ reveal.clue }}".</template>
    </p>
  </div>
  <p v-else class="line">The results are on the big screen.</p>
</template>

<style scoped>
.wl-reveal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.line {
  color: var(--ink);
  font-weight: 600;
  text-align: center;
}
</style>
