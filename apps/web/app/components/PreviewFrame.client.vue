<script setup lang="ts">
/**
 * Renders its slot inside a same-origin <iframe> so the content gets its OWN
 * viewport. This is the whole point: CSS viewport units (vw/vh) used by block
 * views resolve to the DEVICE width (390 phone / 1280 big screen) instead of the
 * editor window, so the previews are pixel-faithful to the real phone and TV.
 * (Without a frame, a block sizing a font in `vw` renders far too large here.)
 *
 * The slot is TELEPORTED into the frame, so it stays in the PARENT's Vue render
 * tree: reactivity, props, two-way binding, and provide/inject (the preview's
 * mock room) all keep working; only the DOM nodes live in the iframe, where the
 * viewport is correct. Parent stylesheets (theme vars + block scoped styles) are
 * mirrored into the frame head and kept in sync (HMR / lazy style injects).
 *
 * The frame renders at its LOGICAL size and is transform-scaled to fit the
 * container (the device bezel), so a 1280px stage shrinks to the pane and a 390px
 * phone is never upscaled past 1:1 (`maxScale`). Client-only.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Logical CSS width of the frame's viewport (vw resolves to this). */
    width: number
    /** Logical height; omit to fill the container (content scrolls inside). */
    height?: number
    /** Active theme id; set as data-theme on the frame's <html>. */
    themeId: string
    /** Cap the scale so a small device is not upscaled past 1:1. */
    maxScale?: number
    /** Accessible name for the frame. */
    title?: string
  }>(),
  { maxScale: Number.POSITIVE_INFINITY, title: 'Preview' },
)

const root = ref<HTMLElement | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const mountEl = ref<HTMLElement | null>(null)

const boxW = ref(props.width)
const boxH = ref(props.height ?? 0)
let ro: ResizeObserver | null = null
let headObserver: MutationObserver | null = null

const scale = computed(() => Math.min(props.maxScale, boxW.value / props.width || 1))
const logicalH = computed(() => props.height ?? Math.max(1, Math.round(boxH.value / scale.value)))
const frameStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${logicalH.value}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}))

// Mirror every parent stylesheet (theme vars + block scoped styles + fonts) into
// the frame head. Links are re-created with their ABSOLUTE href (the frame's base
// is about:blank, so a relative href would not resolve).
function mirrorHead(doc: Document) {
  for (const stale of Array.from(doc.head.querySelectorAll('[data-doot-mirror]'))) stale.remove()
  for (const node of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    let clone: HTMLElement
    if (node.tagName === 'LINK') {
      const link = doc.createElement('link')
      link.rel = 'stylesheet'
      link.href = (node as HTMLLinkElement).href
      clone = link
    } else {
      clone = doc.createElement('style')
      clone.textContent = node.textContent
    }
    clone.setAttribute('data-doot-mirror', '')
    doc.head.appendChild(clone)
  }
}

function setup() {
  const doc = frame.value?.contentDocument
  if (!doc?.body) return
  doc.documentElement.setAttribute('data-theme', props.themeId)
  if (!doc.getElementById('doot-frame-base')) {
    const base = doc.createElement('base')
    base.setAttribute('href', document.baseURI)
    doc.head.appendChild(base)
    const reset = doc.createElement('style')
    reset.id = 'doot-frame-base'
    // Fill the frame, scroll only when content overflows, inherit the theme surface.
    reset.textContent =
      'html,body{margin:0;height:100%}body{background:var(--surface);color:var(--ink);overflow-x:hidden;overflow-y:auto;-webkit-font-smoothing:antialiased}#doot-root{min-height:100%;display:flex;flex-direction:column;box-sizing:border-box}'
    doc.head.appendChild(reset)
  }
  mirrorHead(doc)
  // Re-mirror on any parent head change: node add/remove (Vite injecting a block's
  // scoped style on first mount) and in-place text edits (HMR). Head is tiny, so
  // the broad observation is cheap.
  headObserver?.disconnect()
  headObserver = new MutationObserver(() => mirrorHead(doc))
  headObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
  let target = doc.getElementById('doot-root') as HTMLElement | null
  if (!target) {
    target = doc.createElement('div')
    target.id = 'doot-root'
    doc.body.appendChild(target)
  }
  mountEl.value = target
}

watch(
  () => props.themeId,
  (id) => frame.value?.contentDocument?.documentElement.setAttribute('data-theme', id),
)

function measure() {
  const el = root.value
  if (!el) return
  boxW.value = el.clientWidth
  boxH.value = el.clientHeight
}

onMounted(() => {
  measure() // synchronous first measure, so the frame is sized before the RO settles
  requestAnimationFrame(measure) // and again once layout has flushed
  if (root.value) {
    ro = new ResizeObserver(measure)
    ro.observe(root.value)
  }
  // Frame wiring runs ONLY on @load: a srcdoc iframe exposes a transient about:blank
  // (with a body) before the srcdoc loads, so wiring here would mount #doot-root into
  // a document the browser then discards. The @load listener is bound at element
  // creation, before insertion and before srcdoc navigation begins, so it can't be
  // missed.
})
onBeforeUnmount(() => {
  ro?.disconnect()
  headObserver?.disconnect()
})
</script>

<template>
  <div ref="root" class="pf-root">
    <iframe
      ref="frame"
      class="pf-frame"
      :style="frameStyle"
      :title="props.title"
      srcdoc="<!doctype html><html><head></head><body></body></html>"
      @load="setup"
    />
    <Teleport v-if="mountEl" :to="mountEl">
      <slot />
    </Teleport>
  </div>
</template>

<style scoped>
.pf-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.pf-frame {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  display: block;
  background: var(--surface);
}
</style>
