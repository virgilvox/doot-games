/**
 * Host side of the bridge — runs in the TRUSTED Doot app. Owns the iframe, creates
 * the private MessageChannel, and is the only path by which a plugin's `submit` can
 * reach the relay. The plugin is hostile, so enforcement lives HERE, not in the
 * caller: every inbound message is flood-limited, size-capped, schema-validated,
 * version-checked, and (for `submit`) phase-gated before a callback ever fires.
 * The host must STILL re-validate `submit.input` against the block's own schema
 * before publishing — passing the bridge schema is necessary, not sufficient.
 */
import { BRIDGE_LIMITS, BOOTSTRAP, type HostToPlugin, PROTOCOL_VERSION, pluginToHost } from './protocol'

/** Reused to measure inbound payloads in real UTF-8 bytes (not UTF-16 code units). */
const BYTE_ENCODER = new TextEncoder()

/** Why an inbound message was dropped (surfaced to `onInvalid` for telemetry). */
export type DropReason = 'schema' | 'oversize' | 'flood' | 'phase' | 'version'

export interface HostCallbacks {
  onReady?: (info: { protocolVersion: number }) => void
  /** Re-validate `input` against the block's own schema before publishing it. */
  onSubmit?: (input: unknown) => void
  onResize?: (h: number) => void
  /** The plugin announced an incompatible protocol major; do not run it. */
  onIncompatible?: (pluginVersion: number) => void
  /** An inbound message was dropped (invalid, oversized, flooding, or out of phase). */
  onInvalid?: (data: unknown, reason: DropReason) => void
}

export interface HostOptions {
  /** Our protocol version (defaults to the package's `PROTOCOL_VERSION`). */
  protocolVersion?: number
  maxMessagesPerSecond?: number
  maxBytes?: number
  /** Phases in which a `submit` is accepted (last-write-wins until the host locks). */
  acceptSubmitPhases?: readonly string[]
}

export interface PluginHostHandle {
  send: (m: HostToPlugin) => void
  close: () => void
}

/**
 * Core: drive a plugin over an already-connected MessagePort. Used by
 * `createPluginHost` and directly in tests.
 */
export function createPortHost(port: MessagePort, cb: HostCallbacks, opts: HostOptions = {}): PluginHostHandle {
  const ourVersion = opts.protocolVersion ?? PROTOCOL_VERSION
  const maxPerSec = opts.maxMessagesPerSecond ?? BRIDGE_LIMITS.maxMessagesPerSecond
  const maxBytes = opts.maxBytes ?? BRIDGE_LIMITS.maxBytes
  const acceptPhases = opts.acceptSubmitPhases ?? BRIDGE_LIMITS.acceptSubmitPhases

  let ready = false
  // The phase the host last told the plugin it was in; used to gate `submit`.
  let currentPhase: string | undefined
  // Per-second flood counter — a cheap fixed window (resets on the first message
  // >=1s after it opened). Approximate: a steady stream straddling boundaries can
  // pass up to ~2x the rate over a sliding second, which is fine for a DoS backstop.
  let windowStart = 0
  let inWindow = 0

  port.onmessage = (ev: MessageEvent) => {
    // 1) Flood guard — a runaway plugin must not be able to spam the host/relay.
    const now = Date.now()
    if (now - windowStart >= 1000) {
      windowStart = now
      inWindow = 0
    }
    if (++inWindow > maxPerSec) {
      cb.onInvalid?.(ev.data, 'flood')
      return
    }

    // 2) Size backstop — a single giant payload must not reach the relay/DB.
    // Measured in real UTF-8 bytes; an unstringifiable payload (BigInt, circular)
    // is malformed, so it's dropped as a schema failure, not an oversize.
    let serialized: string | undefined
    try {
      serialized = JSON.stringify(ev.data)
    } catch {
      cb.onInvalid?.(ev.data, 'schema')
      return
    }
    if (serialized !== undefined && BYTE_ENCODER.encode(serialized).length > maxBytes) {
      cb.onInvalid?.(ev.data, 'oversize')
      return
    }

    // 3) Schema.
    const parsed = pluginToHost.safeParse(ev.data)
    if (!parsed.success) {
      cb.onInvalid?.(ev.data, 'schema')
      return
    }
    const m = parsed.data

    switch (m.t) {
      case 'ready':
        // 4) Version negotiation — a pinned, immutable plugin can't be patched in
        // lockstep with the host, so refuse an incompatible major loudly.
        if (Math.trunc(m.protocolVersion) !== Math.trunc(ourVersion)) {
          cb.onIncompatible?.(m.protocolVersion)
          return
        }
        if (ready) return // ignore duplicate readys
        ready = true
        cb.onReady?.({ protocolVersion: m.protocolVersion })
        break
      case 'submit':
        // 5) Phase gate — drop submits outside the open phase (and before any round).
        if (currentPhase === undefined || !acceptPhases.includes(currentPhase)) {
          cb.onInvalid?.(ev.data, 'phase')
          return
        }
        cb.onSubmit?.(m.input)
        break
      case 'resize':
        cb.onResize?.(m.h)
        break
    }
  }
  port.start()

  const send = (m: HostToPlugin) => {
    // Remember the phase we put the plugin in so its `submit`s can be gated.
    if (m.t === 'round' || m.t === 'state') currentPhase = m.phase
    port.postMessage(m)
  }
  return {
    send,
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
  opts: HostOptions = {},
): PluginHostHandle & { bootstrap: () => void } {
  const channel = new MessageChannel()
  const handle = createPortHost(channel.port1, cb, opts)
  return {
    ...handle,
    bootstrap: () => {
      // targetOrigin '*' is unavoidable for a null-origin sandboxed frame and
      // provides NO peer authentication — the load-bearing control is the plugin
      // side pinning `e.source === window.parent` (see plugin.ts). The body carries
      // no secret, only the transferred port, which makes later traffic private.
      iframe.contentWindow?.postMessage({ t: BOOTSTRAP }, '*', [channel.port2])
    },
  }
}
