/**
 * Make a Doot account an admin (and create it first if it doesn't exist yet).
 *
 * Normally you don't need this: the FIRST account ever created is auto-promoted to
 * admin (see `ensureFirstAdmin` in apps/web/server/utils/admin-repo.ts), and
 * `DOOT_ADMIN_EMAILS` is an env override. This script is the manual escape hatch: it
 * sets the durable `user.role='admin'` column for an arbitrary account, creating it
 * (with a password, via better-auth's argon2id hashing) when it doesn't exist yet.
 *
 * Usage (from the repo root):
 *   node scripts/set-admin.mjs <email> [password]
 *
 *   node scripts/set-admin.mjs moheeb.698@gmail.com virgilvox     # create + promote
 *   node scripts/set-admin.mjs someone@existing.com               # promote existing
 *
 * Env:
 *   DATABASE_URL   libSQL URL (default: the app's local SQLite at
 *                  apps/web/.data/doot.sqlite). Point at prod's DB to promote there.
 *   ADMIN_NAME     display name for a newly created account (default: email prefix)
 */
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(resolve(here, '../apps/web/package.json'))

const [email, password] = process.argv.slice(2)
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/set-admin.mjs <email> [password]')
  process.exit(2)
}
const normEmail = email.trim().toLowerCase()
const name = process.env.ADMIN_NAME || email.split('@')[0]

const dbUrl =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgres')
    ? process.env.DATABASE_URL
    : `file:${resolve(here, '../apps/web/.data/doot.sqlite')}`

const { createClient } = require('@libsql/client')
const client = createClient({ url: dbUrl })

// Make sure the moderation/role columns exist even on a DB that predates them.
for (const ddl of [
  "ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'user'",
  'ALTER TABLE user ADD COLUMN banned INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE user ADD COLUMN banReason TEXT',
  'ALTER TABLE user ADD COLUMN bannedAt INTEGER',
]) {
  try {
    await client.execute(ddl)
  } catch {
    /* column already exists */
  }
}

async function findUser() {
  const r = await client.execute({ sql: 'SELECT id, email FROM user WHERE lower(email) = ?', args: [normEmail] })
  return r.rows[0] ?? null
}

let user = await findUser()

if (!user) {
  if (!password) {
    console.error(
      `No account for ${email}, and no password given to create one.\n` +
        `Either have them sign up at /login first, then re-run with just the email,\n` +
        `or pass a password: node scripts/set-admin.mjs ${email} <password>`,
    )
    process.exit(1)
  }
  console.log(`No account for ${email}; creating it…`)
  const { betterAuth } = require('better-auth')
  const { LibsqlDialect } = require('@libsql/kysely-libsql')
  const { hash, verify } = require('@node-rs/argon2')
  // Minimal config that matches the app's password hashing so the credential is
  // valid for the real app's sign-in (argon2id, not better-auth's default scrypt).
  const auth = betterAuth({
    database: { dialect: new LibsqlDialect({ url: dbUrl }), type: 'sqlite' },
    secret: process.env.SESSION_PASSWORD || process.env.NUXT_SESSION_PASSWORD || 'doot-dev-session-password-change-me-32',
    emailAndPassword: {
      enabled: true,
      password: { hash: (p) => hash(p), verify: ({ hash: h, password: p }) => verify(h, p) },
    },
  })
  const res = await auth.api.signUpEmail({ body: { email: normEmail, password, name } })
  if (!res || (!res.user && !res.token && res.error)) {
    console.error('Could not create the account:', res?.error ?? res)
    process.exit(1)
  }
  user = await findUser()
  if (!user) {
    console.error('Account creation reported success but no row was found; aborting.')
    process.exit(1)
  }
  console.log(`Created account ${user.id}.`)
}

await client.execute({ sql: "UPDATE user SET role = 'admin' WHERE id = ?", args: [user.id] })
console.log(`✓ ${email} is now an admin (role='admin', id=${user.id}).`)
console.log(`  DB: ${dbUrl}`)
console.log('  Tip: also set DOOT_ADMIN_EMAILS for a DB-independent bootstrap.')
process.exit(0)
