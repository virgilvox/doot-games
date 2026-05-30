/**
 * Authentication via better-auth. Optional and non-blocking — it only gates
 * saving games; hosting and playing never need an account.
 *
 * better-auth owns its own tables (user/session/account/verification) through
 * its Kysely adapter over the same libSQL database as the games store; the
 * tables are created at startup by `server/plugins/auth-migrate.ts`. Passwords
 * are hashed with argon2id (the project's chosen algorithm) rather than the
 * default scrypt. Sessions are sealed cookies — there is no server session store.
 */
import { LibsqlDialect } from '@libsql/kysely-libsql'
import { hash, verify } from '@node-rs/argon2'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { databaseUrl } from './db'

const envSecret = process.env.SESSION_PASSWORD || process.env.NUXT_SESSION_PASSWORD
// Fail closed in production: a known dev secret would make sessions forgeable.
if (!envSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_PASSWORD (32+ chars) must be set in production to seal sessions.')
}
const secret = envSecret || 'doot-dev-session-password-change-me-32'

export const authOptions: BetterAuthOptions = {
  appName: 'Doot',
  database: { dialect: new LibsqlDialect({ url: databaseUrl() }), type: 'sqlite' },
  secret,
  baseURL: process.env.PUBLIC_BASE_URL || undefined,
  emailAndPassword: {
    enabled: true,
    // Use argon2id rather than better-auth's default scrypt.
    password: {
      hash: (password) => hash(password),
      verify: ({ hash: h, password }) => verify(h, password),
    },
  },
  // Throttle auth endpoints (per IP) to blunt brute-force and signup spam.
  rateLimit: { enabled: true, window: 60, max: 20 },
}

let instance: ReturnType<typeof betterAuth> | null = null

/** The shared better-auth instance. */
export function useAuth() {
  if (!instance) instance = betterAuth(authOptions)
  return instance
}
