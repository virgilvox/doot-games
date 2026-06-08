<script setup lang="ts">
/**
 * Phone view for a chain round. The `content` prop is either the authored seed
 * content (round 0: write an opening line) or this player's SECRET per-player view
 * (a pass round: the single line they received to build on, delivered to their own
 * private address). You only ever see the ONE line passed to you, which is the whole
 * fun: the story drifts as it travels the room.
 */
import { computed } from 'vue'
import { type ChainlineInput, type ChainlineSecret, cleanLine } from './block'

const props = defineProps<{ content: ChainlineSecret; modelValue: ChainlineInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: ChainlineInput] }>()

const isSeed = computed(() => props.content?.seed === true)
const received = computed(() => props.content?.received ?? '')
const step = computed(() => props.content?.step ?? 1)
const total = computed(() => props.content?.total ?? 1)

function onInput(e: Event) {
  emit('update:modelValue', { text: cleanLine((e.target as HTMLTextAreaElement).value) })
}
</script>

<template>
  <div class="chain">
    <div class="step">Line {{ step }} of {{ total }}</div>

    <div v-if="isSeed" class="card seed">
      <span class="badge">Start a story</span>
      <p class="lead">Write the opening line. Make it a good hook, the next player only sees what you write.</p>
    </div>
    <div v-else class="card pass">
      <span class="badge">The story so far</span>
      <p v-if="received" class="received">{{ received }}</p>
      <p v-else class="received muted">(nothing reached you yet, just add a line)</p>
      <p class="lead">Continue it with the next line. You only see this one line.</p>
    </div>

    <label class="line-label" for="chain-line">{{ isSeed ? 'Your opening line' : 'Your next line' }}</label>
    <textarea
      id="chain-line"
      class="line-input"
      :value="modelValue.text"
      :disabled="disabled"
      maxlength="240"
      rows="3"
      autocomplete="off"
      :placeholder="isSeed ? 'Once upon a time...' : 'And then...'"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.chain {
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
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.card.pass {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-2));
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
.received.muted {
  font-weight: 600;
  color: var(--ink-soft);
}
.lead {
  margin-top: 10px;
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
