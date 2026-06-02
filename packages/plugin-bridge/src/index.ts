/**
 * @doot-games/plugin-bridge — the typed, Zod-validated postMessage bridge between
 * Doot (host) and an untrusted, sandboxed game plugin. The production graduation of
 * the reference implementation in examples/external-plugin/bridge.ts. See
 * docs/external-plugins.md and docs/plugin-authoring-roadmap.md.
 */
export * from './protocol'
export * from './plugin'
export * from './host'
