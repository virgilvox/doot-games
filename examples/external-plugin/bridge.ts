/**
 * The external-plugin bridge protocol (reference implementation).
 *
 * This is the ONLY channel between Doot (the host) and an untrusted plugin running
 * in a sandboxed, null-origin iframe. Every message is schema-validated; the host
 * trusts nothing from the plugin. The plugin never sees cookies, the session, the
 * DB, the host DOM, or the raw relay — it only receives redacted round state and may
 * `submit` one input.
 *
 * Mirrors `@doot-games/plugin-bridge` (the production package), kept self-contained
 * so the dev harness needs no platform packages. The production package additionally
 * enforces inbound flood/size limits and phase-gates `submit`; the security-critical
 * parts — null-origin sandbox, the source-pinned handshake, answer-withholding, and
 * protocol versioning — are shown here. See docs/external-plugins.md.
 */
// Zero-install: the dev harness loads zod from a CDN so `vite` needs no
// node_modules in this folder and the import works inside the null-origin plugin
// frame. The production package (@doot-games/plugin-bridge) imports the npm `zod`.
import { z } from 'https://esm.sh/zod@4'

/** Bump the major on any breaking message change. Both sides exchange it so a
 *  pinned (immutable) plugin and a newer host can detect incompatibility. */
export const PROTOCOL_VERSION = 1
/** The single bootstrap message the host posts to the iframe to transfer the port. */
export const BOOTSTRAP = '__doot_bridge_port'

// ---- Host → plugin -------------------------------------------------------
export const hostToPlugin = z.discriminatedUnion('t', [
  z.object({ t: z.literal('init'), block: z.string(), role: z.enum(['player', 'host']), theme: z.record(z.string(), z.string()), protocolVersion: z.number().int() }),
  z.object({ t: z.literal('round'), content: z.unknown(), phase: z.string(), index: z.number().int().min(0) }),
  z.object({ t: z.literal('state'), myInput: z.unknown().nullable(), phase: z.string(), results: z.unknown().optional() }),
  // `answer` is sent ONLY at reveal, so a plugin cannot read answers early.
  z.object({ t: z.literal('answer'), key: z.unknown() }),
])
export type HostToPlugin = z.infer<typeof hostToPlugin>

// ---- Plugin → host (exactly one actionable verb) -------------------------
export const pluginToHost = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), protocolVersion: z.number().int() }),
  z.object({ t: z.literal('submit'), input: z.unknown() }), // host re-validates vs the block's schema
  z.object({ t: z.literal('resize'), h: z.number().min(0).max(1600) }),
])
export type PluginToHost = z.infer<typeof pluginToHost>

/**
 * PLUGIN SIDE. Call once at startup inside the iframe. Resolves with a connection
 * that delivers validated host messages and lets you `submit`.
 *
 * Source-pinned: the bootstrap is accepted ONLY from the embedding host
 * (`e.source === window.parent`) and ONLY on the typed BOOTSTRAP message. Without
 * this, any context that can post a MessagePort into this window could race the real
 * host, win the channel, and forge messages — including a fake `answer` key.
 */
export function connectToHost(handlers: {
  onInit?: (m: Extract<HostToPlugin, { t: 'init' }>) => void
  onRound?: (m: Extract<HostToPlugin, { t: 'round' }>) => void
  onState?: (m: Extract<HostToPlugin, { t: 'state' }>) => void
  onAnswer?: (m: Extract<HostToPlugin, { t: 'answer' }>) => void
}): { submit: (input: unknown) => void; resize: (h: number) => void } {
  let port: MessagePort | null = null
  const send = (m: PluginToHost) => port?.postMessage(m)

  window.addEventListener('message', (e: MessageEvent) => {
    if (port) return
    if (e.source !== window.parent) return
    if ((e.data as { t?: unknown } | null)?.t !== BOOTSTRAP) return
    if (!e.ports?.[0]) return
    port = e.ports[0]
    port.onmessage = (ev) => {
      const parsed = hostToPlugin.safeParse(ev.data)
      if (!parsed.success) return // ignore anything off-protocol
      const m = parsed.data
      if (m.t === 'init') handlers.onInit?.(m)
      else if (m.t === 'round') handlers.onRound?.(m)
      else if (m.t === 'state') handlers.onState?.(m)
      else if (m.t === 'answer') handlers.onAnswer?.(m)
    }
    send({ t: 'ready', protocolVersion: PROTOCOL_VERSION })
  })

  return {
    submit: (input) => send({ t: 'submit', input }),
    resize: (h) => send({ t: 'resize', h }),
  }
}

/**
 * HOST SIDE (used by the dev harness, and by the real platform later). Wraps a
 * sandboxed iframe: bootstraps the MessagePort, validates every inbound message,
 * checks the plugin's protocol version, and exposes typed sends. The production
 * package also enforces flood/size limits and phase-gates submit, and serves the
 * plugin under the strict CSP on a separate origin.
 */
export function createPluginHost(
  iframe: HTMLIFrameElement,
  on: { onReady?: () => void; onSubmit?: (input: unknown) => void; onResize?: (h: number) => void },
) {
  const channel = new MessageChannel()
  channel.port1.onmessage = (ev) => {
    const parsed = pluginToHost.safeParse(ev.data)
    if (!parsed.success) {
      console.warn('[bridge] rejected off-protocol message from plugin', ev.data)
      return
    }
    const m = parsed.data
    if (m.t === 'ready') {
      if (Math.trunc(m.protocolVersion) !== PROTOCOL_VERSION) {
        console.warn('[bridge] incompatible plugin protocol version', m.protocolVersion)
        return
      }
      on.onReady?.()
    } else if (m.t === 'submit') {
      on.onSubmit?.(m.input) // host MUST re-validate vs the block schema before publishing
    } else if (m.t === 'resize') {
      on.onResize?.(m.h)
    }
  }
  const send = (m: HostToPlugin) => channel.port1.postMessage(m)
  // Bootstrap: hand the plugin its port. targetOrigin '*' is unavoidable for a
  // null-origin sandboxed frame and gives no peer authentication — the plugin side
  // pinning `e.source === window.parent` is the control. The port makes later
  // traffic private.
  function bootstrap() {
    iframe.contentWindow?.postMessage({ t: BOOTSTRAP }, '*', [channel.port2])
  }
  return { bootstrap, send }
}
