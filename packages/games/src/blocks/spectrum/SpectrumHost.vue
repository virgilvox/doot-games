<script setup lang="ts">
/**
 * Big-screen Spectrum view. While players place their dials it shows a count (the
 * placements stay hidden so nobody anchors on the room). At reveal it plots every
 * mark on the dial and draws the consensus line.
 */
import type { RoundState } from '@doot-games/engine'
import { SpectrumDial } from '@doot-games/ui'
import { computed } from 'vue'
import { type SpectrumContent, type SpectrumInput, scoreSpectrum } from './logic'

const props = defineProps<{
  content: SpectrumContent
  inputs: Map<string, SpectrumInput>
  state: RoundState
  answer?: unknown
}>()

const done = computed(() => props.state === 'reveal')
const count = computed(() => {
  let n = 0
  for (const v of props.inputs.values()) if (typeof v?.value === 'number') n++
  return n
})
const result = computed(() => scoreSpectrum(props.inputs))
const markValues = computed(() => result.value.marks.map((m) => m.value))
</script>

<template>
  <div class="spectrum-host">
    <div class="dial-wrap">
      <SpectrumDial
        :left-label="content.leftLabel"
        :right-label="content.rightLabel"
        readonly
        :marks="done ? markValues : []"
        :mean="done ? result.mean : null"
      />
    </div>
    <template v-if="!done">
      <div class="big-count">
        <span class="num mono">{{ count }}</span>
        <span class="lbl">placed</span>
      </div>
      <p class="hint">Where does the room land?</p>
    </template>
    <p v-else class="reveal-title">The room landed there.</p>
  </div>
</template>

<style scoped>
.spectrum-host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  min-height: 220px;
  justify-content: center;
}
.dial-wrap {
  width: min(720px, 92%);
}
.big-count {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.num {
  font-size: clamp(48px, 10vw, 96px);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}
.lbl {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 14px;
}
.hint {
  color: var(--ink-soft);
  font-weight: 600;
}
.reveal-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 3.5vw, 30px);
}
</style>
