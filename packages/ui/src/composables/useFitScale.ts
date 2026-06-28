import { type Ref, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

/**
 * Shrink-to-fit for big-screen display content (info slides, title cards) that
 * should always be readable AT A GLANCE rather than scroll. It scales the
 * element's content DOWN (never up) until it stops overflowing its own box, by
 * binary-searching a `--fit` custom property which the element's CSS multiplies
 * its font sizes (and gaps) by.
 *
 * Requirements on the target element:
 *  - a bounded height (e.g. `height: 100%` of a height-bounded parent), so
 *    `scrollHeight > clientHeight` actually means "overflows";
 *  - its font-size/gap declarations use `calc(... * var(--fit, 1))`.
 *
 * Re-fits on mount, whenever `deps` change (new content), and when the element
 * resizes (window/layout). Client-only — a no-op during SSR. Setting `--fit`
 * changes type size but not the element's own box, so the ResizeObserver does
 * not loop.
 */
export function useFitScale(
  el: Ref<HTMLElement | null>,
  deps: () => unknown,
  opts: { min?: number; steps?: number } = {},
) {
  const min = opts.min ?? 0.5
  const steps = opts.steps ?? 8
  let ro: ResizeObserver | null = null
  let raf = 0

  function measure() {
    const node = el.value
    if (!node) return
    // Measure overflow against the BOUNDED parent, not the node itself: a fill
    // element with `height:100%` inside a flex parent often falls back to its
    // content height (the flexbox percentage-height gotcha), so its own
    // scrollHeight === clientHeight even while it overflows the stage. The parent
    // (e.g. the stage cell) carries the real available size.
    const bound = node.parentElement
    // The parent's clientHeight includes its padding, but the node only gets the
    // content box — subtract the padding so the fit targets the real budget (else
    // it leaves a few px that still trip the scrollbar).
    let padY = 0
    let padX = 0
    if (bound) {
      const cs = getComputedStyle(bound)
      padY = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom)
      padX = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)
    }
    const availH = () => (bound ? bound.clientHeight - padY : node.clientHeight)
    const availW = () => (bound ? bound.clientWidth - padX : node.clientWidth)
    const fits = () => node.scrollHeight <= availH() + 1 && node.scrollWidth <= availW() + 1
    node.style.setProperty('--fit', '1')
    if (fits()) return // already fits at full size — never upscale
    let lo = min
    let hi = 1
    for (let i = 0; i < steps; i++) {
      const mid = (lo + hi) / 2
      node.style.setProperty('--fit', mid.toFixed(3))
      if (fits()) lo = mid
      else hi = mid
    }
    node.style.setProperty('--fit', lo.toFixed(3))
  }

  function schedule() {
    if (typeof window === 'undefined') return
    cancelAnimationFrame(raf)
    // Let Vue flush the DOM, then measure on the next frame (fonts/layout settled).
    nextTick(() => {
      raf = requestAnimationFrame(measure)
    })
  }

  onMounted(() => {
    schedule()
    if (typeof ResizeObserver !== 'undefined' && el.value) {
      ro = new ResizeObserver(() => schedule())
      ro.observe(el.value)
    }
  })
  onBeforeUnmount(() => {
    ro?.disconnect()
    if (typeof window !== 'undefined') cancelAnimationFrame(raf)
  })
  watch(deps, schedule)
}
