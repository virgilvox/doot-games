import { createClient } from '@libsql/client'
import { getMigrations } from 'better-auth/db/migration'
import { authOptions } from '../utils/auth'
import { databaseUrl } from '../utils/db'
import { markMigrationDone, recordMigrationFailure, runAdditive } from '../utils/migration-status'

/**
 * Create/extend better-auth's tables at startup so the app stays zero-config (no
 * separate migration step). Idempotent and additive.
 *
 * We run better-auth's generated schema STATEMENT BY STATEMENT rather than via
 * `runMigrations()`. `runMigrations()` executes the whole batch and aborts on the
 * first failure, and on an EXISTING `user` table the username UNIQUE-column ALTER
 * always fails (SQLite "Cannot add a UNIQUE column"). That abort would otherwise
 * stop every later statement, including the CREATE TABLEs for the oidc/mcp plugin
 * (the "Connect with Claude" OAuth provider). Running each statement in its own
 * try/catch lets the new tables be created even though one ALTER fails, on both
 * fresh and already-deployed databases.
 *
 * The username/bio columns the UNIQUE ALTER can't add are then added by the manual
 * fallback below: plain columns plus a separate UNIQUE INDEX. Column names match
 * better-auth's camelCase convention (`displayUsername`, not snake_case).
 */
export default defineNitroPlugin(async () => {
  const client = createClient({ url: databaseUrl() })
  const exec = (sql: string) => client.execute(sql)

  try {
    const { compileMigrations } = await getMigrations(authOptions)
    const sql = await compileMigrations()
    // Benign + expected on a redeploy: the table/column/index already exists, or
    // it's the username UNIQUE-column ALTER SQLite rejects (handled by the manual
    // fallback below). Anything else is recorded as a real failure: logged loudly
    // and surfaced on /api/ready, which the deploy waits on.
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await runAdditive('auth-schema', exec, stmt)
    }
  } catch (err) {
    recordMigrationFailure('auth-schema', err, 'compile better-auth migrations')
  }

  // Manual fallback: add the profile columns the username plugin / bio field need.
  // Each ALTER is a no-op ("duplicate column") once applied.
  for (const ddl of [
    'ALTER TABLE user ADD COLUMN username TEXT',
    'ALTER TABLE user ADD COLUMN displayUsername TEXT',
    'ALTER TABLE user ADD COLUMN bio TEXT',
    // Admin/moderation columns (see server/utils/admin.ts). Plain columns, so a
    // simple ALTER works on an existing table (unlike the UNIQUE username column).
    // `role` is 'user' (default/null) or 'admin'; `banned` gates content actions.
    "ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'user'",
    'ALTER TABLE user ADD COLUMN banned INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE user ADD COLUMN banReason TEXT',
    'ALTER TABLE user ADD COLUMN bannedAt INTEGER',
    // The uniqueness guard the plugin can't add via ALTER on an existing table.
    'CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON user(username)',
  ]) {
    await runAdditive('auth-schema', exec, ddl)
  }
  client.close()
  markMigrationDone('auth-schema')

  // Now that the `user` table + role column exist, run the one-time first-admin
  // bootstrap: on an existing deployment this promotes the earliest account on the
  // first boot of this code; on a brand-new (empty) deployment it no-ops here and the
  // sign-up hook (server/utils/auth.ts) catches the first account instead.
  try {
    const { ensureFirstAdmin } = await import('../utils/admin-repo')
    await ensureFirstAdmin()
  } catch (err) {
    console.error('[doot] first-admin bootstrap (startup) failed:', err)
  }
})
