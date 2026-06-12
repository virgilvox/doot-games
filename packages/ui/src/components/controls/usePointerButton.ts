/**
 * The momentary pointer-capture pattern shared by every "hold to fire" control
 * (PadButton, Buzzer, Bumper). Each control owns its own pointer id, so a hold
 * survives the thumb drifting off the element AND two controls work at once
 * (left-thumb d-pad + right-thumb A/B): pointer capture routes each pointer's
 * stream to its capturing element, independent of the others.
 *
 * Pointer and keyboard presses are tracked separately and combined, so they can
 * interleave without un-sticking each other. The combined state is also released
 * on `lostpointercapture` (capture revoked without a pointerup, e.g. the element
 * re-renders mid-press) and when the control is `disabled` mid-press, the two
 * ways a naive momentary button gets stuck "down".
 *
 * Returns a reactive `pressed` flag and a set of event handlers to spread onto a
 * native `<button>` with `v-on="handlers"`. The keys are BARE event names (not the
 * `onX` form): Vue's `v-on="obj"` adds the `on` prefix itself via `toHandlers`, so
 * an `onPointerdown` key would bind a never-fired `onpointerdown` event.
 * SSR-safe (haptics are feature-detected).
 */
import { type Ref, ref, watch } from 'vue'

export interface PointerButtonHandlers {
  pointerdown: (e: PointerEvent) => void
  pointerup: () => void
  pointercancel: () => void
  lostpointercapture: () => void
  contextmenu: (e: Event) => void
  keydown: (e: KeyboardEvent) => void
  keyup: (e: KeyboardEvent) => void
}

export function usePointerButton(
  onChange: (pressed: boolean) => void,
  opts: { haptic?: boolean; disabled?: () => boolean } = {},
): { pressed: Ref<boolean>; handlers: PointerButtonHandlers } {
  const pressed = ref(false)
  let pid: number | null = null
  let pointerDown = false
  let keyDown = false

  /** Recompute the combined press state and emit only on a real transition. */
  const sync = () => {
    const next = pointerDown || keyDown
    if (pressed.value === next) return
    pressed.value = next
    onChange(next)
    if (next && opts.haptic !== false && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10)
      } catch {
        /* ignore */
      }
    }
  }
  const releasePointer = () => {
    pid = null
    pointerDown = false
    sync()
  }

  // A control disabled mid-press must release, or the native button stops firing
  // pointerup and the logical press is stranded held forever.
  if (opts.disabled) {
    watch(opts.disabled, (isDisabled) => {
      if (isDisabled) {
        pid = null
        pointerDown = false
        keyDown = false
        sync()
      }
    })
  }

  const handlers: PointerButtonHandlers = {
    pointerdown(e) {
      if (opts.disabled?.()) return
      e.preventDefault()
      if (pid !== null) return
      pid = e.pointerId
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(pid)
      } catch {
        /* capture is best-effort */
      }
      pointerDown = true
      sync()
    },
    pointerup: releasePointer,
    pointercancel: releasePointer,
    lostpointercapture: releasePointer,
    contextmenu(e) {
      // A long-press context menu would otherwise eat the hold.
      e.preventDefault()
    },
    keydown(e) {
      if (opts.disabled?.()) return
      if (e.key === ' ' || e.key === 'Enter') {
        if (e.repeat) return
        e.preventDefault()
        keyDown = true
        sync()
      }
    },
    keyup(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        keyDown = false
        sync()
      }
    },
  }

  return { pressed, handlers }
}
