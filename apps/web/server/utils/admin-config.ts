/**
 * Pure admin configuration helpers (no DB, no auth, no session imports) so both the
 * auth layer and the admin repo can read them without an import cycle.
 *
 * `DOOT_ADMIN_EMAILS` is an optional env allowlist. It does two things:
 *  - always grants admin to those emails (a can't-be-locked-out override), and
 *  - tells the one-time first-admin bootstrap WHICH existing account to promote
 *    (preferred over "earliest account") so an operator can be precise on prod.
 */

/** The lowercased email allowlist from `DOOT_ADMIN_EMAILS`. Empty if unset. */
export function adminEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.DOOT_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** True if this email is in the env allowlist (always-on admin override). */
export function isAllowlistedAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmailAllowlist().has(email.trim().toLowerCase())
}
