/**
 * Plugin side of the bridge — runs INSIDE the sandboxed iframe. The plugin never
 * touches cookies, the session, the DB, the host DOM, or the raw relay; it only
 * receives validated, already-redacted state and may `submit` one input.
 */
import { BOOTSTRAP, hostToPlugin, type HostToPlugin, PROTOCOL_VERSION, type PluginToHost } from './protocol'

export interface PluginHandlers {
  onInit?: (m: Extract<HostToPlugin, { t: 'init' }>) => void
  onRound?: (m: Extract<HostToPlugin, { t: 'round' }>) => void
  onState?: (m: Extract<HostToPlugin, { t: 'state' }>) => void
  /** Sent only at reveal — this is the first time the plugin can see the answer. */
  onAnswer?: (m: Extract<HostToPlugin, { t: 'answer' }>) => void
}

export interface PluginConnection {
  submit: (input: unknown) => void
  resize: (h: number) => void
  /** Stop listening and close the port. */
  close: () => void
}

/**
 * Core: wire an already-obtained MessagePort to validated handlers. Used by
 * `connectToHost` once the host's bootstrap arrives, and directly in tests.
 * Messages that fail the schema are ignored (the host may add message kinds in a
 * later protocol version; an old plugin must not crash on them).
 */
export function attachPluginPort(port: MessagePort, handlers: PluginHandlers): PluginConnection {
  const send = (m: PluginToHost) => port.postMessage(m)
  port.onmessage = (ev: MessageEvent) => {
    const parsed = hostToPlugin.safeParse(ev.data)
    if (!parsed.success) return
    const m = parsed.data
    switch (m.t) {
      case 'init':
        handlers.onInit?.(m)
        break
      case 'round':
        handlers.onRound?.(m)
        break
      case 'state':
        handlers.onState?.(m)
        break
      case 'answer':
        handlers.onAnswer?.(m)
        break
    }
  }
  port.start()
  send({ t: 'ready', protocolVersion: PROTOCOL_VERSION })
  return {
    submit: (input) => send({ t: 'submit', input }),
    resize: (h) => send({ t: 'resize', h }),
    close: () => {
      port.onmessage = null
      port.close()
    },
  }
}

/**
 * DOM entry: call once at plugin startup inside the iframe. Resolves once the host
 * has handed over its private MessagePort (via a single window bootstrap message);
 * after that all traffic is port-private and origin-bound.
 *
 * Source-pinned to close a port-hijack: the bootstrap is accepted ONLY from the
 * embedding host (`e.source === window.parent`) and ONLY on the typed `BOOTSTRAP`
 * message. Without this, any context that can post a `MessagePort` into this window
 * (a frame the plugin itself nests, an opener, a sibling that grabbed a handle)
 * could race the real host, win the channel, and forge host messages — including a
 * fake `answer` key. `targetOrigin '*'` on the host side gives zero peer
 * authentication, so this check is the load-bearing control.
 */
export function connectToHost(handlers: PluginHandlers): Promise<PluginConnection> {
  return new Promise((resolve) => {
    const onBootstrap = (e: MessageEvent) => {
      if (e.source !== window.parent) return
      if ((e.data as { t?: unknown } | null)?.t !== BOOTSTRAP) return
      const port = e.ports?.[0]
      if (!port) return
      window.removeEventListener('message', onBootstrap)
      resolve(attachPluginPort(port, handlers))
    }
    window.addEventListener('message', onBootstrap)
  })
}
