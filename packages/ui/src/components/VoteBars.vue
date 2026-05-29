<script setup lang="ts">
/** Animated value bars for rating averages and poll/choice distributions. */
interface Bar {
  label: string
  value: number
  /** Upper bound for the fill (e.g. the rating scale max, or the vote total). */
  max: number
  /** Optional caption under the value, e.g. "12 ratings". */
  note?: string
}
withDefaults(defineProps<{ bars: Bar[]; unit?: string }>(), { unit: '' })
const pct = (v: number, max: number) => (max > 0 ? Math.min(100, (v / max) * 100) : 0)
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
</script>

<template>
  <div class="bars">
    <div v-for="(b, i) in bars" :key="i" class="bar-row">
      <div class="btop">
        <span class="blabel">{{ b.label }}</span>
        <span class="bval">{{ fmt(b.value) }}<small v-if="unit"> {{ unit }}</small></span>
      </div>
      <div class="track">
        <span class="fill" :style="{ width: `${pct(b.value, b.max)}%` }" />
      </div>
      <span v-if="b.note" class="bnote mono">{{ b.note }}</span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: grid;
  gap: 12px;
}
.bar-row {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.btop {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.blabel {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 14px;
}
.bval {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 30px;
  color: var(--c2);
  line-height: 1;
}
.bval small {
  font-size: 14px;
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-weight: 400;
}
.track {
  height: 14px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 2px solid var(--line-soft);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, var(--c2), color-mix(in srgb, var(--c2) 70%, transparent));
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.bnote {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-soft);
}
</style>
