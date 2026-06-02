/**
 * The wire protocol between Doot (the trusted host) and an untrusted game plugin
 * running in a sandboxed, null-origin iframe. This is the ENTIRE surface the two
 * sides share. Every message is Zod-validated on receipt; the host trusts nothing.
 *
 * Design + threat model: docs/external-plugins.md. Two invariants live here:
 *   - The plugin only ever learns the answer key via the `answer` message, which
 *     the host sends ONLY at reveal - so a plugin cannot read answers early.
 *   - The plugin's only actionable verb is `submit`; its `input` is re-validated
 *     by the host against the block's own schema before anything reaches the relay.
 */
import { z } from 'zod'

/** Theme tokens handed to the plugin: CSS custom-property name -> value. */
export const themeTokens = z.record(z.string(), z.string())
export type ThemeTokens = z.infer<typeof themeTokens>

/**
 * Host -> plugin. `answer` is sent ONLY at the reveal step; before that the
 * plugin has never been given the key, so answer-withholding holds by construction.
 */
export const hostToPlugin = z.discriminatedUnion('t', [
  z.object({ t: z.literal('init'), block: z.string(), role: z.enum(['player', 'host']), theme: themeTokens, protocolVersion: z.number().int() }),
  z.object({ t: z.literal('round'), content: z.unknown(), phase: z.string(), index: z.number().int().min(0) }),
  z.object({ t: z.literal('state'), myInput: z.unknown().nullable(), phase: z.string(), results: z.unknown().optional() }),
  z.object({ t: z.literal('answer'), key: z.unknown() }),
])
export type HostToPlugin = z.infer<typeof hostToPlugin>

/**
 * Plugin -> host. Exactly one actionable verb. `submit.input` passing this schema
 * is necessary but NOT sufficient: the host must re-validate it against the block's
 * own content/input schema before publishing to CLASP.
 */
export const pluginToHost = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), protocolVersion: z.number().int() }),
  z.object({ t: z.literal('submit'), input: z.unknown() }),
  z.object({ t: z.literal('resize'), h: z.number().min(0).max(1600) }),
])
export type PluginToHost = z.infer<typeof pluginToHost>

/** The single bootstrap message the host posts to the iframe to transfer a port. */
export const BOOTSTRAP = '__doot_bridge_port' as const

/**
 * Bridge protocol version. Pinned, immutable plugins can't be patched when the host
 * evolves, so both sides exchange this in init/ready and the host refuses an
 * incompatible major rather than hanging the round. Bump the major on any breaking
 * message-shape change.
 */
export const PROTOCOL_VERSION = 1

/** Bridge-level enforcement defaults (the host may override per-call). */
export const BRIDGE_LIMITS = {
  /** Inbound messages/second from the plugin before excess is dropped (flood guard). */
  maxMessagesPerSecond: 120,
  /** Max serialized bytes per inbound message (relay/phone/DB DoS backstop; blocks
   *  should still set tighter `.max()` on their own input schemas). */
  maxBytes: 262_144,
  /** Phases in which a `submit` is accepted (last-write-wins until the host locks).
   *  Defaults to the engine's open RoundState ('open'); a host that sends a different
   *  phase vocabulary must override this. The host MUST keep round/state `phase`
   *  truthful - the gate trusts it to decide when submissions close. */
  acceptSubmitPhases: ['open'] as readonly string[],
} as const
