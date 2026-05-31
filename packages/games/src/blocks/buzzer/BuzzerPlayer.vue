<script setup lang="ts">
/**
 * Phone input for a gameshow question: big lettered answer buttons. Tapping
 * selects an option AND records how long it took (from the question appearing on
 * this phone), so the host can crown the fastest correct "buzz-in".
 */
import { onMounted, ref, watch } from 'vue'
import type { BuzzerContent, BuzzerInput } from './block'

const props = defineProps<{ content: BuzzerContent; modelValue: BuzzerInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: BuzzerInput] }>()

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
// When this question became answerable on this phone (clock-skew-immune: each
// phone measures its own elapsed time, like Kahoot).
const openedAt = ref(0)
function markOpen() {
  openedAt.value = typeof performance !== 'undefined' ? performance.now() : Date.now()
}
onMounted(markOpen)
// Reset the clock if the question changes while mounted.
watch(() => props.content, markOpen)

function pick(i: number) {
  if (props.disabled) return
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
  emit('update:modelValue', { choice: i, ms: Math.max(0, Math.round(nowMs - openedAt.value)) })
}
</script>

<template>
  <div class="buzzer">
    <button
      v-for="(opt, i) in content.options"
      :key="i"
      type="button"
      class="buzzer-opt"
      :class="{ picked: modelValue.choice === i }"
      :disabled="disabled"
      :aria-pressed="modelValue.choice === i"
      @click="pick(i)"
    >
      <span class="letter">{{ LETTERS[i] }}</span>
      <img v-if="opt.image" :src="opt.image" alt="" class="opt-img" />
      <span class="opt-label">
        <span class="opt-text">{{ opt.label }}</span>
        <span v-if="opt.sublabel" class="opt-sub">{{ opt.sublabel }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.buzzer {
  display: grid;
  gap: 12px;
}
.buzzer-opt {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: clamp(16px, 4.4vw, 20px);
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.08s ease, border-color 0.12s ease, background 0.12s ease;
}
.buzzer-opt:active {
  transform: translateY(1px);
}
.buzzer-opt.picked {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 16%, var(--surface-2));
  box-shadow: var(--shadow), var(--glow) color-mix(in srgb, var(--primary) 40%, transparent);
}
.letter {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
  color: var(--primary-ink);
  background: var(--primary);
  border: var(--bd) solid var(--line);
}
.opt-img {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 8px;
  border: var(--bd) solid var(--line-soft);
}
.opt-label {
  overflow-wrap: anywhere;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.opt-sub {
  font-size: 12px;
  font-weight: 600;
  color: var(--mute);
  line-height: 1.25;
}
</style>
