<script setup lang="ts">
/** A countdown ring driven by remaining/total milliseconds (computed by the host). */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ remaining: number; total: number }>(), { total: 0 })

const seconds = computed(() => Math.max(0, Math.ceil(props.remaining / 1000)))
const fraction = computed(() => (props.total > 0 ? Math.max(0, props.remaining / props.total) : 0))
const warn = computed(() => seconds.value <= 5 && props.remaining > 0)
const ringStyle = computed(() => ({
  background: `conic-gradient(var(--c1) ${fraction.value * 360}deg, color-mix(in srgb, var(--ink) 10%, transparent) 0)`,
}))
</script>

<template>
  <div class="cd" :class="{ warn }" role="timer" :aria-label="`${seconds} seconds left`">
    <div class="ring" :style="ringStyle">
      <div class="inner mono">{{ seconds }}</div>
    </div>
  </div>
</template>

<style scoped>
.cd {
  display: inline-grid;
  place-items: center;
}
.ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.inner {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--surface);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 22px;
  color: var(--ink);
}
.cd.warn .ring {
  animation: cd-pulse 0.6s infinite alternate;
}
@keyframes cd-pulse {
  to {
    filter: brightness(1.2);
  }
}
</style>
