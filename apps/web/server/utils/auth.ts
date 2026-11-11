/**
 * Authentication via better-auth. Optional and non-blocking, it only gates
 * saving games; hosting and playing never need an account.
 *
 * better-auth owns its own tables (user/session/account/verification) through
 * its Kysely adapter over the same libSQL database as the games store; the
 * tables are created at startup by `server/plugins/auth-migrate.ts`. Passwords
 * are hashed with argon2id (the project's chosen algorithm) rather than the
 * default scrypt. Sessions are rows in the `session` table, referenced by a
 * signed, httpOnly cookie (7-day lifetime, sliding daily), so they can be revoked
 * server-side, e.g. after a password reset.
 */
import { LibsqlDialect } from '@libsql/kysely-libsql'
import { hash, verify } from '@node-rs/argon2'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { mcp, username } from 'better-auth/plugins'
import { sql } from 'drizzle-orm'
import { databaseUrl, useDb } from './db'
import { sendMail } from './mailer'
import { buildResetUrl, RESET_TOKEN_TTL_SECONDS, ResetThrottle, resetEmail } from './password-reset'

/**
 * Server-side bounds on the user-editable profile fields. The editor enforces
 * these too, but a client could POST /api/auth/update-user directly with a
 * multi-megabyte `bio`/`name` (durable-storage DoS) or a non-URL `image` that is
 * then rendered as an `<img src>` on every public profile. Enforced here at the
 * better-auth boundary so the editor's caps aren't the only line of defense.
 */
const PROFILE_MAX = { name: 60, bio: 280, displayUsername: 40, image: 2000 } as const
const validateProfile = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/update-user' && ctx.path !== '/sign-up/email') return
  const body = (ctx.body ?? {}) as Record<string, unknown>
  for (const [field, max] of Object.entries(PROFILE_MAX)) {
    const v = body[field]
    if (typeof v === 'string' && v.length > max) {
      throw new APIError('BAD_REQUEST', { message: `Your ${field} is too long.` })
    }
  }
  // An avatar URL is rendered to every profile visitor; only allow http(s).
  if (typeof body.image === 'string' && body.image.length > 0 && !/^https?:\/\//i.test(body.image)) {
    throw new APIError('BAD_REQUEST', { message: 'Avatar must be an http(s) URL.' })
  }
})

/**
 * After a sign-up, run the one-time first-admin bootstrap so the very first account on
 * a fresh deployment becomes admin (the startup pass can't, there are no accounts yet).
 * Idempotent + marker-guarded in `ensureFirstAdmin`, so this never re-promotes. Imported
 * lazily to avoid an auth <-> admin-repo import cycle, and never allowed to fail the
 * sign-up.
 */
const bootstrapFirstAdmin = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-up/email') return
  try {
    const { ensureFirstAdmin } = await import('./admin-repo')
    await ensureFirstAdmin()
  } catch {
    /* bootstrap retries on the next sign-up / restart */
  }
})

/**
 * Handles that collide with a top-level route (or are otherwise reserved) and so
 * may never be claimed as a profile @handle. Enforced server-side by the username
 * plugin's `usernameValidator`; the editor mirrors this list for a live hint.
 */
export const RESERVED_HANDLES = new Set([
  'account', 'login', 'logout', 'signup', 'explore', 'create', 'host', 'play',
  'g', 'u', 'mine', 'support', 'api', 'editor', 'admin', 'doot', 'help', 'about',
  'connect', 'mcp', 'oauth',
])

/** Handle (username) shape: 3-24 chars, lowercase letters/digits/underscore. */
export const HANDLE_MIN = 3
export const HANDLE_MAX = 24
const HANDLE_RE = /^[a-z0-9_]+$/

/** True if `h` (already lowercased) is a structurally valid, non-reserved handle. */
export function isValidHandle(h: string): boolean {
  return h.length >= HANDLE_MIN && h.length <= HANDLE_MAX && HANDLE_RE.test(h) && !RESERVED_HANDLES.has(h)
}

const envSecret = process.env.SESSION_PASSWORD || process.env.NUXT_SESSION_PASSWORD
// Fail closed unless explicitly in development: the committed dev secret would
// make session cookies forgeable, so only `NODE_ENV=development` may use it (an
// unset NODE_ENV in a built/prod image must not silently fall back).
if (!envSecret && process.env.NODE_ENV !== 'development') {
  throw new Error('SESSION_PASSWORD (32+ chars) must be set outside development to seal sessions.')
}
const secret = envSecret || 'doot-dev-session-password-change-me-32'

const baseURL = process.env.PUBLIC_BASE_URL || undefined
// Pin the origins better-auth's CSRF check trusts. Without this, an unset
// baseURL would let it fall back to the request host, weakening the guard.
// localhost is trusted only in development: in production it would be a valid
// CSRF origin and redirect target for anyone running a local server.
const trustedOrigins = [
  baseURL,
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined,
].filter((o): o is string => !!o)

const resetThrottle = new ResetThrottle()

/**
 * Email a password-reset link. Called by better-auth's /request-password-reset
 * ONLY when the address belongs to an account; the HTTP response is identical
 * either way.
 *
 * Fire-and-forget: better-auth awaits this hook, so awaiting the Resend call would
 * make "account exists" measurably slower than "no account". The link is built
 * from PUBLIC_BASE_URL, never the request Host, so a forged Host header can't
 * point the emailed link at another site. Logs carry no address or token.
 */
async function sendResetPassword({ user, token }: { user: { email: string }; token: string }): Promise<void> {
  const base = process.env.PUBLIC_BASE_URL?.trim() || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
  if (!base) {
    console.error('[doot] password reset requested but PUBLIC_BASE_URL is unset; no email sent')
    return
  }
  if (!resetThrottle.allow(user.email)) return
  void sendMail(resetEmail(user.email, buildResetUrl(base, token))).catch((err) => {
    console.error('[doot] password reset email failed:', err instanceof Error ? err.message : String(err))
  })
}

/**
 * After a successful reset, cut off every way back in that the old password (or
 * whoever knew it) set up. better-auth deletes the user's sessions
 * (revokeSessionsOnPasswordReset), but "Connect with Claude" OAuth tokens live in
 * their own tables and would otherwise keep working for up to 7 days.
 */
async function revokeOAuthAccess({ user }: { user: { id: string } }): Promise<void> {
  try {
    const db = await useDb()
    await db.run(sql`DELETE FROM oauthAccessToken WHERE userId = ${user.id}`)
    await db.run(sql`DELETE FROM oauthConsent WHERE userId = ${user.id}`)
  } catch (err) {
    console.error('[doot] revoking OAuth access after password reset failed:', err instanceof Error ? err.message : String(err))
  }
}

export const authOptions = {
  appName: 'Doot',
  database: { dialect: new LibsqlDialect({ url: databaseUrl() }), type: 'sqlite' },
  secret,
  baseURL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Use argon2id rather than better-auth's default scrypt.
    password: {
      hash: (password) => hash(password),
      verify: ({ hash: h, password }) => verify(h, password),
    },
    // Password reset (see server/utils/password-reset.ts). The token is single use
    // and expires after an hour; a successful reset signs out every session and
    // revokes Claude/MCP access.
    sendResetPassword,
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: revokeOAuthAccess,
  },
  // Store reset tokens HASHED, so a DB snapshot or backup can't be replayed into a
  // reset. Only the `reset-password:` prefix: the mcp plugin keeps OAuth codes in
  // the same table and is left on its default.
  verification: {
    storeIdentifier: { default: 'plain', overrides: { 'reset-password:': 'hashed' } },
  },
  // A public profile @handle (vanity URL). Optional: hosting/playing/saving never
  // need one; an account claims it from /account. The plugin adds `username`
  // (normalized, unique) + `displayUsername`. NOTE: on an existing `user` table
  // SQLite can't ADD a UNIQUE column, so the columns + unique index are added by
  // a manual fallback in server/plugins/auth-migrate.ts (see that file).
  plugins: [
    username({
      minUsernameLength: HANDLE_MIN,
      maxUsernameLength: HANDLE_MAX,
      // Validate after lowercasing so mixed-case input is accepted and normalized.
      validationOrder: { username: 'post-normalization' },
      usernameValidator: (u) => isValidHandle(u),
    }),
    // "Connect with Claude": make Doot an OAuth provider for MCP so a user can link
    // their account inside claude.ai (or Claude Code) and have Claude save games
    // straight to their account. Adds the oidc tables (created at startup) plus the
    // authorize / token / consent / dynamic-client-registration endpoints under
    // /api/auth. The protected resource is the /mcp endpoint (see server/routes/mcp.ts).
    mcp({
      loginPage: '/login',
      resource: `${baseURL || 'http://localhost:3000'}/mcp`,
      oidcConfig: {
        loginPage: '/login',
        consentPage: '/oauth/consent',
        allowDynamicClientRegistration: true,
      },
    }),
  ],
  // A short public bio. Auto-migrated as an additional `user` column.
  user: {
    additionalFields: {
      bio: { type: 'string', required: false, input: true },
    },
  },
  // Bound the user-editable profile fields server-side (length + avatar scheme), and
  // run the first-admin bootstrap after a sign-up.
  hooks: { before: validateProfile, after: bootstrapFirstAdmin },
  // Throttle auth endpoints (per IP) to blunt brute-force and signup spam.
  rateLimit: { enabled: true, window: 60, max: 20 },
  // `satisfies` (not a `: BetterAuthOptions` annotation) so the plugin-augmented
  // api types (e.g. the mcp plugin's getMcpSession) survive inference for callers
  // like withMcpAuth and the /.well-known discovery routes.
} satisfies BetterAuthOptions

/** Build the instance once; the inferred return type carries the plugin api
 *  (e.g. the mcp plugin's getMcpSession) so typed callers like withMcpAuth work. */
function createAuth() {
  return betterAuth(authOptions)
}
let instance: ReturnType<typeof createAuth> | null = null

/** The shared better-auth instance. */
export function useAuth(): ReturnType<typeof createAuth> {
  if (!instance) instance = createAuth()
  return instance
}
