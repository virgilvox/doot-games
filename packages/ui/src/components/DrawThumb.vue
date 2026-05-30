<script setup lang="ts">
/**
 * A lightweight SVG rendering of a drawing, used for the host gallery, where
 * many drawings show at once. SVG (not Pixi) avoids spinning up a WebGL context
 * per tile, so it scales to a roomful of submissions.
 */
import { computed } from 'vue'
import { type DrawValue, strokePath } from '../draw'

const props = withDefaults(defineProps<{ value: DrawValue; aspect?: number }>(), { aspect: 0.7 })
const dots = computed(() => props.value.strokes.filter((s) => s.points.length === 2))
const lines = computed(() => props.value.strokes.filter((s) => s.points.length > 2))
</script>

<template>
  <svg
    class="draw-thumb"
    :viewBox="`0 0 1 ${aspect}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="A player's drawing"
  >
    <rect x="0" y="0" width="1" :height="aspect" fill="#ffffff" />
    <path
      v-for="(s, i) in lines"
      :key="`l${i}`"
      :d="strokePath(s)"
      fill="none"
      :stroke="s.color"
      :stroke-width="s.size"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle
      v-for="(s, i) in dots"
      :key="`d${i}`"
      :cx="s.points[0]"
      :cy="s.points[1]"
      :r="s.size / 2"
      :fill="s.color"
    />
  </svg>
</template>

<style scoped>
.draw-thumb {
  width: 100%;
  height: auto;
  display: block;
  border: var(--bd) solid var(--line-soft);
  border-radius: 12px;
  background: #fff;
}
</style>
