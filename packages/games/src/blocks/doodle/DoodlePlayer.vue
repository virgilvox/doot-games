<script setup lang="ts">
/**
 * Phone view for a doodle (draw-and-describe chain) round. The `content` prop is the
 * authored seed content (round 0: write a prompt) or this player's SECRET per-player
 * view: on a DRAW round, the neighbor's text to draw; on a DESCRIBE round, the
 * neighbor's drawing to name. You only ever see the ONE thing passed to you.
 */
import { DrawCanvas, type DrawValue, DrawThumb } from '@doot-games/ui'
import { computed } from 'vue'
import type { DoodleInput, DoodleSecret } from './block'

const props = defineProps<{ content: DoodleSecret; modelValue: DoodleInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: DoodleInput] }>()

const isSeed = computed(() => props.content?.seed === true)
const isDraw = computed(() => props.content?.mode === 'draw')
const aspect = computed(() => props.content?.aspect ?? 0.7)
const step = computed(() => props.content?.step ?? 1)
const total = computed(() => props.content?.total ?? 1)

const receivedText = computed(() => props.content?.received?.text ?? '')
const receivedDrawing = computed<DrawValue>(() => ({ strokes: props.content?.received?.strokes ?? [] }))
const drawValue = computed<DrawValue>(() => ({ strokes: props.modelValue?.strokes ?? [] }))

function onText(e: Event) {
  emit('update:modelValue', { text: (e.target as HTMLTextAreaElement).value.replace(/\s+/g, ' ').slice(0, 200) })
}
function onDraw(v: DrawValue) {
  emit('update:modelValue', { strokes: v.strokes })
}
</script>

<template>
  <div class="doodle">
    <div class="step">Round {{ step }} of {{ total }}</div>

    <!-- DRAW round: show the prompt you were handed, then a canvas. -->
    <template v-if="isDraw">
      <div class="card pass" role="group" :aria-label="`Draw this prompt: ${receivedText || 'anything you like'}`">
        <span class="badge">Draw this</span>
        <p class="received">{{ receivedText || '(no prompt reached you, draw anything)' }}</p>
      </div>
      <DrawCanvas :model-value="drawValue" :aspect="aspect" :disabled="disabled" @update:model-value="onDraw" />
    </template>

    <!-- DESCRIBE round (pass): show the drawing you were handed, then a text box. -->
    <template v-else-if="!isSeed">
      <div class="card pass">
        <span class="badge">What is this?</span>
        <DrawThumb :value="receivedDrawing" :aspect="aspect" label="The drawing you were handed" />
      </div>
      <label class="line-label" for="doodle-text">Your guess</label>
      <textarea
        id="doodle-text"
        class="line-input"
        :value="modelValue.text ?? ''"
        :disabled="disabled"
        maxlength="200"
        rows="2"
        autocomplete="off"
        placeholder="A cat riding a bike?"
        @input="onText"
      />
    </template>

    <!-- SEED round: write a prompt for the next player to draw. -->
    <template v-else>
      <div class="card seed">
        <span class="badge">Write a prompt</span>
        <p class="lead">Write something for the next player to draw. The funnier the better.</p>
      </div>
      <label class="line-label" for="doodle-text">Your prompt</label>
      <textarea
        id="doodle-text"
        class="line-input"
        :value="modelValue.text ?? ''"
        :disabled="disabled"
        maxlength="200"
        rows="2"
        autocomplete="off"
        placeholder="A dog wearing sunglasses on the moon"
        @input="onText"
      />
    </template>
  </div>
</template>

<style scoped>
.doodle {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.step {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  font-size: 12px;
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
.received {
  margin-top: 10px;
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 700;
  line-height: 1.35;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.card.pass :deep(.draw-thumb) {
  margin-top: 10px;
  width: 100%;
  height: auto;
  border-radius: calc(var(--radius) - 4px);
  border: var(--bd) solid var(--line-soft);
}
.lead {
  margin-top: 8px;
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.4;
}
.line-label {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.line-input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: clamp(17px, 4.5vw, 20px);
  font-weight: 600;
  line-height: 1.4;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
  box-shadow: var(--shadow-sm);
  resize: vertical;
}
.line-input:focus {
  outline: none;
  border-color: var(--primary);
}
</style>
