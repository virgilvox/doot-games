/**
 * The wire protocol between Doot (the trusted host) and an untrusted game plugin
 * running in a sandboxed, null-origin iframe. This is the ENTIRE surface the two
 * sides share. Every message is Zod-validated on receipt; the host trusts nothing.
 *
 * Design + threat model: docs/external-plugins.md. Two invariants live here:
 *   - The plugin only ever learns the answer key via the `answer` message, which
 *     the host sends ONLY at reveal — so a plugin cannot read answers early.
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
  z.object({ t: z.literal('init'), block: z.string(), role: z.enum(['player', 'host']), theme: themeTokens }),
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
  z.object({ t: z.literal('ready') }),
  z.object({ t: z.literal('submit'), input: z.unknown() }),
  z.object({ t: z.literal('resize'), h: z.number().min(0).max(4000) }),
])
export type PluginToHost = z.infer<typeof pluginToHost>

/** The single bootstrap message the host posts to the iframe to transfer a port. */
export const BOOTSTRAP = '__doot_bridge_port' as const
