/**
 * Host side of the bridge — runs in the TRUSTED Doot app. Owns the iframe, creates
 * the private MessageChannel, validates every inbound message, and is the only path
 * by which a plugin's `submit` can reach the relay (after a second, block-schema
 * validation the host performs before publishing).
 */
import { BOOTSTRAP, type HostToPlugin, pluginToHost } from './protocol'

export interface HostCallbacks {
  onReady?: () => void
  /** Re-validate `input` against the block's own schema before publishing it. */
  onSubmit?: (input: unknown) => void
  onResize?: (h: number) => void
  /** A message from the plugin that failed schema validation (dropped). */
  onInvalid?: (data: unknown) => void
}

export interface PluginHostHandle {
  send: (m: HostToPlugin) => void
  close: () => void
}

/**
 * Core: drive a plugin over an already-connected MessagePort. Every inbound
 * message is validated; anything off-protocol is dropped and surfaced via
 * `onInvalid` (never trusted). Used by `createPluginHost` and directly in tests.
 */
export function createPortHost(port: MessagePort, cb: HostCallbacks): PluginHostHandle {
  port.onmessage = (ev: MessageEvent) => {
    const parsed = pluginToHost.safeParse(ev.data)
    if (!parsed.success) {
      cb.onInvalid?.(ev.data)
      return
    }
    const m = parsed.data
    switch (m.t) {
      case 'ready':
        cb.onReady?.()
        break
      case 'submit':
        cb.onSubmit?.(m.input)
        break
      case 'resize':
        cb.onResize?.(m.h)
        break
    }
  }
  port.start()
  return {
    send: (m) => port.postMessage(m),
    close: () => {
      port.onmessage = null
      port.close()
    },
  }
}

/**
 * DOM entry: attach to a sandboxed iframe. Creates the MessageChannel and keeps
 * one port; `bootstrap()` hands the other to the iframe. Call `bootstrap()` after
 * the iframe's `load` event.
 */
export function createPluginHost(
  iframe: HTMLIFrameElement,
  cb: HostCallbacks,
): PluginHostHandle & { bootstrap: () => void } {
  const channel = new MessageChannel()
  const handle = createPortHost(channel.port1, cb)
  return {
    ...handle,
    bootstrap: () => {
      // targetOrigin '*' is required for a null-origin sandboxed frame; the
      // transferred port makes all subsequent traffic private and origin-bound,
      // so '*' here leaks nothing (the body carries no secret, only the port).
      iframe.contentWindow?.postMessage({ t: BOOTSTRAP }, '*', [channel.port2])
    },
  }
}
