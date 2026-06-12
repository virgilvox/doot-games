/**
 * A thin controller around EmulatorJS, the browser emulator that runs the ROM on
 * the host's big screen. EmulatorJS is a global-script loader (it reads
 * `window.EJS_*` globals and injects a player into a mount element), so this
 * wraps the lifecycle: `boot` a ROM, `reboot` to hot-swap a different ROM/console
 * on the same running session, feed it input with `simulate`, and grab the canvas
 * (for a future spectator stream). All `window` access is inside functions, so the
 * module is import-safe under SSR; call these only on the client.
 *
 * Cores load from the EmulatorJS CDN; ROMs stay in the host's browser (a blob URL
 * from a local file, or a remote URL the host pasted). Threaded cores (N64/PSX)
 * are only enabled when the page is cross-origin isolated; otherwise EmulatorJS
 * falls back to the non-threaded core (slower but works without COEP headers).
 */

const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/'

export interface BootOptions {
  /** A blob: URL or a remote ROM URL. */
  src: string
  /** EmulatorJS core name (e.g. 'nes', 'snes', 'n64'). */
  core: string
  /** Display name shown by EmulatorJS. */
  name: string
  /** Accent color for the EmulatorJS UI (the active theme's primary). */
  color?: string
  /** Whether this core benefits from threads (only used if cross-origin isolated). */
  threaded?: boolean
  /** Called if the core/ROM never boots within the watchdog window. */
  onError?: (message: string) => void
}

interface EjsWindow {
  EJS_player?: string
  EJS_core?: string
  EJS_gameUrl?: string
  EJS_gameName?: string
  EJS_pathtodata?: string
  EJS_startOnLoaded?: boolean
  EJS_color?: string
  EJS_threads?: boolean
  EJS_onGameStart?: () => void
  EJS_emulator?: {
    gameManager?: { simulateInput?: (player: number, index: number, value: number) => void }
    canvas?: HTMLCanvasElement
    elements?: { parent?: { remove?: () => void } }
    callEvent?: (name: string) => void
  }
  crossOriginIsolated?: boolean
}

const win = (): EjsWindow => window as unknown as EjsWindow

export interface EmulatorController {
  boot(opts: BootOptions): void
  reboot(opts: BootOptions): void
  /** Feed a raw EmulatorJS input (button or analog axis) to a player slot. */
  simulate(player: number, index: number, value: number): void
  /** The running game canvas, for capture/streaming. Null until booted. */
  getCanvas(): HTMLCanvasElement | null
  ready(): boolean
  dispose(): void
}

export function createEmulator(mountSelector: string): EmulatorController {
  let isReady = false
  let disposed = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let rebootTimer: ReturnType<typeof setTimeout> | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let loaderScript: HTMLScriptElement | null = null

  const clearTimers = () => {
    if (pollTimer) clearInterval(pollTimer)
    if (watchdog) clearTimeout(watchdog)
    if (rebootTimer) clearTimeout(rebootTimer)
    pollTimer = watchdog = rebootTimer = null
  }

  const teardown = () => {
    clearTimers()
    isReady = false
    const w = win()
    try {
      w.EJS_emulator?.callEvent?.('exit')
    } catch {
      /* not all builds expose this */
    }
    // Replace the mount with a fresh EMPTY copy of itself instead of clearing it.
    // The old EmulatorJS instance keeps a reference to the now-detached old subtree
    // and writes into it harmlessly, while the next boot mounts cleanly into the
    // fresh node. (Clearing innerHTML mid-init makes EmulatorJS write to a removed
    // element and throw.)
    const el = document.querySelector(mountSelector)
    if (el?.parentNode) el.parentNode.replaceChild(el.cloneNode(false), el)
    loaderScript?.remove()
    loaderScript = null
    w.EJS_emulator = undefined
  }

  const start = (opts: BootOptions) => {
    if (disposed) return
    const w = win()
    w.EJS_player = mountSelector
    w.EJS_core = opts.core
    w.EJS_gameUrl = opts.src
    w.EJS_gameName = opts.name
    w.EJS_pathtodata = EJS_DATA
    w.EJS_startOnLoaded = true
    if (opts.color) w.EJS_color = opts.color
    w.EJS_threads = !!(opts.threaded && w.crossOriginIsolated)
    w.EJS_onGameStart = () => {
      isReady = true
    }
    loaderScript = document.createElement('script')
    loaderScript.src = `${EJS_DATA}loader.js`
    loaderScript.onerror = () =>
      opts.onError?.('Could not load the emulator. Check your connection.')
    document.body.appendChild(loaderScript)
    // Belt and suspenders: EJS_onGameStart is the happy path, but poll for the
    // gameManager too, in case the callback timing shifts across builds.
    pollTimer = setInterval(() => {
      const gm = win().EJS_emulator?.gameManager
      if (gm?.simulateInput) {
        isReady = true
        if (pollTimer) clearInterval(pollTimer)
        if (watchdog) clearTimeout(watchdog)
        pollTimer = watchdog = null
      }
    }, 300)
    // If nothing boots in time (bad/CORS ROM url, unreachable CDN), surface it
    // instead of sitting on a black screen forever.
    watchdog = setTimeout(() => {
      if (!isReady)
        opts.onError?.(
          'That ROM did not boot. Check the URL works (and allows CORS), or pick the right console.',
        )
    }, 22000)
  }

  return {
    boot(opts) {
      start(opts)
    },
    reboot(opts) {
      teardown()
      // Let the DOM settle before re-injecting the loader. The handle is tracked
      // so dispose() can cancel it (no start() on a torn-down component).
      rebootTimer = setTimeout(() => start(opts), 60)
    },
    simulate(player, index, value) {
      if (!isReady) return
      try {
        win().EJS_emulator?.gameManager?.simulateInput?.(player, index, value)
      } catch {
        /* a dropped frame is harmless */
      }
    },
    getCanvas() {
      const w = win()
      const direct = w.EJS_emulator?.canvas
      if (direct) return direct
      let best: HTMLCanvasElement | null = null
      document.querySelectorAll<HTMLCanvasElement>(`${mountSelector} canvas`).forEach((c) => {
        if (!best || c.width * c.height > best.width * best.height) best = c
      })
      return best
    },
    ready() {
      return isReady
    },
    dispose() {
      disposed = true
      teardown()
    },
  }
}
