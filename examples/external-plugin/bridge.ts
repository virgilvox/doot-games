/**
 * The external-plugin bridge protocol (reference implementation).
 *
 * This is the ONLY channel between Doot (the host) and an untrusted plugin running
 * in a sandboxed, null-origin iframe. Every message is schema-validated; the host
 * trusts nothing from the plugin. The plugin never sees cookies, the session, the
 * DB, the host DOM, or the raw relay, it only receives redacted round state and may
 * `submit` one input.
 *
 * In production this graduates into `@doot-games/plugin-bridge`; here it's
 * self-contained so the dev harness needs no platform packages. See
 * docs/external-plugins.md for the architecture.
 */
import { z } from 'zod'

// ---- Host → plugin -------------------------------------------------------
export const hostToPlugin = z.discriminatedUnion('t', [
  z.object({ t: z.literal('init'), block: z.string(), role: z.enum(['player', 'host']), theme: z.record(z.string()) }),
  z.object({ t: z.literal('round'), content: z.unknown(), phase: z.string(), index: z.number() }),
  z.object({ t: z.literal('state'), myInput: z.unknown().nullable(), phase: z.string(), results: z.unknown().optional() }),
  // `answer` is sent ONLY at reveal, so a plugin cannot read answers early.
  z.object({ t: z.literal('answer'), key: z.unknown() }),
])
export type HostToPlugin = z.infer<typeof hostToPlugin>

// ---- Plugin → host (exactly one actionable verb) -------------------------
export const pluginToHost = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready') }),
  z.object({ t: z.literal('submit'), input: z.unknown() }), // host re-validates vs the block's schema
  z.object({ t: z.literal('resize'), h: z.number().min(0).max(4000) }),
])
export type PluginToHost = z.infer<typeof pluginToHost>

/**
 * PLUGIN SIDE. Call once at startup inside the iframe. Resolves with a connection
 * that delivers validated host messages and lets you `submit`. The host bootstraps
 * us by posting a single message transferring a MessagePort.
 */
export function connectToHost(handlers: {
  onInit?: (m: Extract<HostToPlugin, { t: 'init' }>) => void
  onRound?: (m: Extract<HostToPlugin, { t: 'round' }>) => void
  onState?: (m: Extract<HostToPlugin, { t: 'state' }>) => void
  onAnswer?: (m: Extract<HostToPlugin, { t: 'answer' }>) => void
}): { submit: (input: unknown) => void; resize: (h: number) => void } {
  let port: MessagePort | null = null
  const send = (m: PluginToHost) => port?.postMessage(m)

  // The host's bootstrap arrives on window with the port in `event.ports[0]`.
  window.addEventListener('message', (e: MessageEvent) => {
    if (port || !e.ports?.[0]) return
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
    send({ t: 'ready' })
  })

  return {
    submit: (input) => send({ t: 'submit', input }),
    resize: (h) => send({ t: 'resize', h }),
  }
}

/**
 * HOST SIDE (used by the dev harness, and by the real platform later). Wraps a
 * sandboxed iframe: bootstraps the MessagePort, validates every inbound message,
 * and exposes typed sends. The platform version also enforces the CSP / origin.
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
    if (m.t === 'ready') on.onReady?.()
    else if (m.t === 'submit') on.onSubmit?.(m.input) // host MUST re-validate vs block schema before publishing
    else if (m.t === 'resize') on.onResize?.(m.h)
  }
  const send = (m: HostToPlugin) => channel.port1.postMessage(m)
  // Bootstrap: hand the plugin its port. targetOrigin '*' is required for a
  // null-origin sandboxed frame; the MessagePort makes subsequent traffic private.
  function bootstrap() {
    iframe.contentWindow?.postMessage({ t: '__port' }, '*', [channel.port2])
  }
  return { bootstrap, send }
}
