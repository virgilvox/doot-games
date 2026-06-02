/**
 * Dev harness config (a plain object so it needs no `vite` import to resolve — this
 * folder has no node_modules of its own).
 *
 * The plugin runs in a `sandbox="allow-scripts"` iframe with a NULL origin (that's
 * the trust boundary). A null-origin document can only load module scripts
 * cross-origin if the server sends CORS headers — so we send
 * `Access-Control-Allow-Origin: *` in dev to let the sandboxed plugin frame fetch
 * `plugin.ts` / `bridge.ts` / the Vite client. (In production the plugin bundle is
 * served same-origin from `plugins.doot.games` under the strict CSP.)
 */
export default {
  server: {
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
}
