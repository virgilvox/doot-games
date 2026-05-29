<script setup lang="ts">
/**
 * Multiple-choice options. Works as a player input (clickable, emits `select`)
 * and as a host display (pass `counts` for live tallies, `revealed`+`correct`
 * to mark the answer). Correctness is shown with a check mark as well as color,
 * so it does not rely on color alone.
 */
import { computed } from 'vue'

interface Opt {
  label: string
  image?: string
}
const props = withDefaults(
  defineProps<{
    options: Opt[]
    selected?: number | null
    counts?: number[] | null
    correct?: number | null
    revealed?: boolean
    disabled?: boolean
  }>(),
  { selected: null, counts: null, correct: null, revealed: false, disabled: false },
)
const emit = defineEmits<{ select: [index: number] }>()

const total = computed(() =>
  props.counts ? Math.max(1, props.counts.reduce((a, b) => a + b, 0)) : 0,
)
const letter = (i: number) => String.fromCharCode(65 + i)
const pct = (i: number) => (props.counts ? ((props.counts[i] ?? 0) / total.value) * 100 : 0)
</script>

<template>
  <div class="opt-grid">
    <button
      v-for="(o, i) in options"
      :key="i"
      type="button"
      class="opt"
      :class="{
        sel: selected === i,
        correct: revealed && correct === i,
        dim: revealed && correct != null && correct !== i,
      }"
      :disabled="disabled"
      :aria-pressed="selected === i"
      @click="emit('select', i)"
    >
      <span v-if="counts" class="fill" :style="{ width: `${pct(i)}%` }" />
      <span class="letter">{{ letter(i) }}</span>
      <img v-if="o.image" :src="o.image" alt="" class="othumb" />
      <span class="olabel">{{ o.label || `Option ${letter(i)}` }}</span>
      <span v-if="revealed && correct === i" class="mark" aria-label="correct">✓</span>
      <span v-if="counts" class="ocount mono">{{ counts[i] ?? 0 }}</span>
    </button>
  </div>
</template>

<style scoped>
.opt-grid {
  display: grid;
  gap: 11px;
}
.opt {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  text-align: left;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 13px;
  box-shadow: var(--shadow-sm);
  color: var(--ink);
  overflow: hidden;
  transition: transform 0.08s, border-color 0.12s, background 0.12s;
}
.opt:not(:disabled):active {
  transform: translate(2px, 2px);
}
.opt .fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-right: 2px solid var(--primary);
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 0;
}
.opt > :not(.fill) {
  position: relative;
  z-index: 1;
}
.letter {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 11px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
}
.othumb {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 9px;
  object-fit: cover;
  border: var(--bd) solid var(--line-soft);
}
.olabel {
  font-weight: 700;
  font-size: clamp(15px, 2vw, 20px);
  flex: 1;
  min-width: 0;
}
.ocount {
  font-weight: 700;
  font-size: 17px;
  color: var(--ink-soft);
  min-width: 2ch;
  text-align: right;
}
.mark {
  font-weight: 800;
  color: var(--c5);
}
.opt.sel {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--line);
}
.opt.sel .letter {
  background: var(--primary-ink);
  color: var(--primary);
}
.opt.correct {
  border-color: var(--c5);
  background: color-mix(in srgb, var(--c5) 16%, var(--surface));
}
.opt.dim {
  opacity: 0.5;
}
</style>
