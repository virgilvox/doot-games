<script setup lang="ts">
/**
 * Phone view for Wavelength. The `content` is this player's per-player view: on a clue
 * round everyone gets one (the clue-giver sees the secret target + writes a clue, the
 * rest wait); on a guess round only the clue-giver gets a per-player "watch" view, so
 * a guesser falls back to the shared derived content (no `isGiver`) and sees the dial.
 */
import { SpectrumDial } from '@doot-games/ui'
import { computed } from 'vue'
import type { WavelengthInput, WavelengthSecret } from './block'

const props = defineProps<{ content: WavelengthSecret; modelValue: WavelengthInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: WavelengthInput] }>()

const isClue = computed(() => props.content?.phase === 'clue')
const isGiver = computed(() => props.content?.isGiver === true)
const left = computed(() => props.content?.leftLabel ?? '')
const right = computed(() => props.content?.rightLabel ?? '')
const target = computed(() => props.content?.target ?? 50)
const clue = computed(() => props.content?.clue ?? '')

function onClue(e: Event) {
  emit('update:modelValue', { clue: (e.target as HTMLInputElement).value.slice(0, 60) })
}
function onGuess(value: number) {
  emit('update:modelValue', { value })
}
</script>

<template>
  <div class="wl">
    <!-- CLUE round, the clue-giver: see the secret target, write a clue. -->
    <template v-if="isClue && isGiver">
      <div class="card">
        <span class="badge">You're the clue-giver</span>
        <p class="lead">Only you can see the target. Write a clue that lands the room on it.</p>
      </div>
      <SpectrumDial :left-label="left" :right-label="right" :mean="target" :marks="[]" readonly />
      <label class="lbl" for="wl-clue">Your clue</label>
      <input
        id="wl-clue"
        class="clue-input"
        type="text"
        :value="modelValue.clue ?? ''"
        :disabled="disabled"
        maxlength="60"
        autocomplete="off"
        placeholder="a word or phrase"
        @input="onClue"
      />
    </template>

    <!-- CLUE round, everyone else: wait. -->
    <div v-else-if="isClue" class="card wait">
      <span class="badge">Hang tight</span>
      <p class="lead">The clue-giver is looking at a secret target and writing a clue. You'll guess next.</p>
    </div>

    <!-- GUESS round, the clue-giver: watch. -->
    <template v-else-if="isGiver">
      <div class="card">
        <span class="badge">Your clue is out</span>
        <p class="lead">You said <strong>"{{ clue }}"</strong>. Watch where the room lands.</p>
      </div>
      <SpectrumDial :left-label="left" :right-label="right" :mean="target" :marks="[]" readonly />
    </template>

    <!-- GUESS round, a guesser: read the clue, place the dial. -->
    <template v-else>
      <div class="card pass">
        <span class="badge">The clue</span>
        <p class="clue-text">{{ clue || '(no clue)' }}</p>
      </div>
      <SpectrumDial
        :left-label="left"
        :right-label="right"
        :model-value="modelValue.value ?? null"
        :disabled="disabled"
        @update:model-value="onGuess"
      />
    </template>
  </div>
</template>

<style scoped>
.wl {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.card {
  border-radius: var(--radius);
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.card.pass {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-2));
}
.badge {
  display: inline-block;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 13px;
  color: var(--primary);
}
.lead {
  margin-top: 8px;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.4;
}
.clue-text {
  margin-top: 8px;
  font-size: clamp(20px, 6vw, 26px);
  font-weight: 800;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.lbl {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.clue-input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}
.clue-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
