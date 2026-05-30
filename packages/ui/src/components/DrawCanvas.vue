<script setup lang="ts">
/**
 * A freehand drawing surface backed by Pixi 8. Strokes are stored normalized
 * (0..1 in both axes; brush size as a fraction of width) so they render at any
 * size, the same data drives this canvas and the SVG thumbnails on the host.
 *
 * This is the documented Pixi fallback (CLAUDE.md): an imperative `Application`
 * mounted into a ref, used here because freehand drawing is pointer-driven and
 * imperative. `pixi.js` is imported lazily in `onMounted` so it never enters the
 * SSR bundle and only loads when someone actually draws.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DrawStroke, DrawValue } from '../draw'

const props = withDefaults(
  defineProps<{
    modelValue: DrawValue
    color?: string
    /** Brush width as a fraction of canvas width. */
    size?: number
    disabled?: boolean
    /** Canvas aspect ratio (height / width). */
    aspect?: number
  }>(),
  { color: '#1f2430', size: 0.012, disabled: false, aspect: 0.7 },
)
const emit = defineEmits<{ 'update:modelValue': [value: DrawValue] }>()

const BASE_WIDTH = 1000
// Bound the payload so a drawing always stays small enough to publish over the
// relay (and cheap to re-render in the host gallery).
const MAX_STROKES = 400
const MAX_POINTS = 600 // per stroke (each point is an x,y pair)
const hostEl = ref<HTMLDivElement>()
// biome-ignore lint/suspicious/noExplicitAny: Pixi types are loaded lazily at runtime
let app: any = null
// biome-ignore lint/suspicious/noExplicitAny: as above
let gfx: any = null
let drawing = false
let current: DrawStroke | null = null

function point(e: PointerEvent): [number, number] {
  if (!app) return [0, 0]
  const rect = (app.canvas as HTMLCanvasElement).getBoundingClientRect()
  const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  return [Number(nx.toFixed(4)), Number(ny.toFixed(4))]
}

function redraw() {
  if (!gfx || !app) return
  const w = app.screen.width
  const h = app.screen.height
  gfx.clear()
  const all = current ? [...props.modelValue.strokes, current] : props.modelValue.strokes
  for (const s of all) {
    const lineW = Math.max(1, s.size * w)
    if (s.points.length === 2) {
      gfx.circle(s.points[0]! * w, s.points[1]! * h, lineW / 2).fill({ color: s.color })
      continue
    }
    gfx.moveTo(s.points[0]! * w, s.points[1]! * h)
    for (let i = 2; i < s.points.length; i += 2) gfx.lineTo(s.points[i]! * w, s.points[i + 1]! * h)
    gfx.stroke({ width: lineW, color: s.color, cap: 'round', join: 'round' })
  }
}

function onDown(e: PointerEvent) {
  if (props.disabled || !app) return
  // Ignore new strokes past the cap (the drawing is already as large as we send).
  if (props.modelValue.strokes.length >= MAX_STROKES) return
  drawing = true
  const [x, y] = point(e)
  current = { color: props.color, size: props.size, points: [x, y] }
  redraw()
}
function onMove(e: PointerEvent) {
  if (!drawing || !current || !app) return
  if (current.points.length >= MAX_POINTS * 2) return // stroke is full
  const [x, y] = point(e)
  const n = current.points.length
  // Skip near-duplicate points to keep strokes compact for the relay.
  if (n >= 2 && Math.abs(x - current.points[n - 2]!) < 0.004 && Math.abs(y - current.points[n - 1]!) < 0.004) return
  current.points.push(x, y)
  redraw()
}
function onUp() {
  if (!drawing || !current) return
  drawing = false
  const finished = current
  current = null
  emit('update:modelValue', { strokes: [...props.modelValue.strokes, finished] })
}

onMounted(async () => {
  const { Application, Graphics } = await import('pixi.js')
  app = new Application()
  await app.init({
    width: BASE_WIDTH,
    height: Math.round(BASE_WIDTH * props.aspect),
    background: '#ffffff',
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  })
  if (!hostEl.value) {
    app.destroy(true)
    app = null
    return
  }
  const canvas = app.canvas as HTMLCanvasElement
  canvas.style.width = '100%'
  canvas.style.height = 'auto'
  canvas.style.touchAction = 'none'
  canvas.style.display = 'block'
  hostEl.value.appendChild(canvas)
  gfx = new Graphics()
  app.stage.addChild(gfx)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  redraw()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onUp)
  if (app) {
    app.destroy(true, { children: true })
    app = null
    gfx = null
  }
})

// External changes (undo / clear from the toolbar) only ever append or truncate
// the array wholesale, so watching its length is enough, and avoids a deep
// walk of every point on each change.
watch(() => props.modelValue.strokes.length, redraw)
</script>

<template>
  <div ref="hostEl" class="draw-canvas" :class="{ disabled }" />
</template>

<style scoped>
.draw-canvas {
  width: 100%;
  border: var(--bd) solid var(--line-soft);
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  line-height: 0;
  touch-action: none;
}
.draw-canvas.disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>
