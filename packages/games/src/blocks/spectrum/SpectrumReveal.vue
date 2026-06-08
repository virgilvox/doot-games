<script setup lang="ts">
/** Phone reveal for a Spectrum round: the dial with everyone's marks + the
 *  consensus line, the player's own mark highlighted, and their score (recomputed
 *  with the same consensus curve the host scored with). */
import { SpectrumDial } from '@doot-games/ui'
import { computed } from 'vue'
import { ballparkCloseness } from '../ballpark/block'
import { BASE_POINTS } from '../scoring'
import { SCALE_HALF, type SpectrumContent, type SpectrumInput } from './logic'

interface Reveal {
  mean: number | null
  marks: number[]
}
const props = defineProps<{ content: SpectrumContent; myInput?: SpectrumInput | null; reveal?: Reveal | null }>()

const mine = computed(() => props.myInput?.value ?? null)
const score = computed(() => {
  const m = props.reveal?.mean
  if (mine.value == null || m == null) return 0
  return Math.round(BASE_POINTS * ballparkCloseness(Math.abs(mine.value - m), SCALE_HALF))
})
</script>

<template>
  <div class="spectrum-reveal big" aria-live="polite">
    <h2>You scored {{ score }}</h2>
    <div class="dial-wrap">
      <SpectrumDial
        :left-label="content.leftLabel"
        :right-label="content.rightLabel"
        readonly
        :marks="reveal?.marks ?? []"
        :mean="reveal?.mean ?? null"
        :mine="mine"
      />
    </div>
    <p class="foot">The line is the room's consensus; your mark is highlighted.</p>
  </div>
</template>

<style scoped>
.spectrum-reveal {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}
.spectrum-reveal h2 {
  font-size: clamp(26px, 7vw, 36px);
  font-weight: 800;
}
.dial-wrap {
  width: 100%;
}
.foot {
  color: var(--ink-soft);
  max-width: 32ch;
  line-height: 1.45;
  font-size: 14px;
}
</style>
