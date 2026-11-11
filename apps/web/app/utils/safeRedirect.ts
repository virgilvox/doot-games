/**
 * Whether a redirect target handed to us by a third party (an OAuth client's
 * registered redirect_uri) is safe to assign to `window.location`.
 *
 * Blocks the schemes that execute or render attacker content in OUR origin
 * (`javascript:`, `data:`, `vbscript:`, `blob:`) plus `file:`. Everything else
 * that parses as an absolute URL is allowed: https callbacks (claude.ai),
 * http://localhost callbacks (Claude Code and other CLI clients), and custom app
 * schemes (e.g. `vscode://`) that hand off to a native app.
 */
const BLOCKED = new Set(['javascript:', 'data:', 'vbscript:', 'blob:', 'file:'])

export function isSafeRedirect(target: string): boolean {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }
  return !BLOCKED.has(url.protocol.toLowerCase())
}
