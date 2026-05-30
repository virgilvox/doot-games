<script setup lang="ts">
/**
 * A theme-colored confetti celebration. Implemented in CSS, light, accessible,
 * and identical on every phone (the CSS-first default; see PRD section 6). The
 * heavier, scene-graph celebrations are where Pixi via vue3-pixi would take
 * over. Hidden entirely under prefers-reduced-motion.
 */
import { onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ count?: number }>(), { count: 90 })

interface Piece {
  left: number
  bg: string
  delay: number
  dur: number
  rot: number
  size: number
  drift: number
}
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--primary)']
const pieces = ref<Piece[]>([])

onMounted(() => {
  pieces.value = Array.from({ length: props.count }, (_, i) => ({
    left: Math.random() * 100,
    bg: COLORS[i % COLORS.length] ?? 'var(--primary)',
    delay: Math.random() * 0.6,
    dur: 1.8 + Math.random() * 1.8,
    rot: Math.random() * 360,
    size: 7 + Math.random() * 9,
    drift: (Math.random() - 0.5) * 220,
  }))
})
</script>

<template>
  <div class="confetti" aria-hidden="true">
    <span
      v-for="(p, i) in pieces"
      :key="i"
      class="piece"
      :style="{
        left: `${p.left}%`,
        background: p.bg,
        width: `${p.size}px`,
        height: `${p.size * 0.6}px`,
        animationDelay: `${p.delay}s`,
        animationDuration: `${p.dur}s`,
        ['--rot']: `${p.rot}deg`,
        ['--drift']: `${p.drift}px`,
      }"
    />
  </div>
</template>

<style scoped>
.confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 50;
}
.piece {
  position: absolute;
  top: -6%;
  border-radius: 2px;
  animation-name: fall;
  animation-timing-function: cubic-bezier(0.3, 0.2, 0.5, 1);
  animation-iteration-count: 1;
  animation-fill-mode: both;
}
@keyframes fall {
  0% {
    transform: translateY(-10%) translateX(0) rotate(var(--rot));
    opacity: 1;
  }
  100% {
    transform: translateY(108vh) translateX(var(--drift)) rotate(calc(var(--rot) + 540deg));
    opacity: 0.9;
  }
}
@media (prefers-reduced-motion: reduce) {
  .confetti {
    display: none;
  }
}
</style>
