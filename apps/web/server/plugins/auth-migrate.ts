import { createClient } from '@libsql/client'
import { getMigrations } from 'better-auth/db/migration'
import { authOptions } from '../utils/auth'
import { databaseUrl } from '../utils/db'

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

  try {
    const { compileMigrations } = await getMigrations(authOptions)
    const sql = await compileMigrations()
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      try {
        await client.execute(stmt)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Benign + expected on a redeploy: the table/column/index already exists, or
        // it's the username UNIQUE-column ALTER SQLite rejects (handled by the manual
        // fallback below). Anything else is a real failure, so log it LOUDLY (not
        // silently) rather than booting "fine" and 500ing at runtime.
        if (/already exists|duplicate column|cannot add a unique column|duplicate index/i.test(msg)) {
          // expected, ignore quietly
        } else {
          console.error('[doot] auth migration statement FAILED (investigate):', msg)
        }
      }
    }
  } catch (err) {
    console.error('[doot] auth migration compile failed:', err)
  }

  // Manual fallback: add the profile columns the username plugin / bio field need.
  try {
    for (const ddl of [
      'ALTER TABLE user ADD COLUMN username TEXT',
      'ALTER TABLE user ADD COLUMN displayUsername TEXT',
      'ALTER TABLE user ADD COLUMN bio TEXT',
    ]) {
      try {
        await client.execute(ddl)
      } catch {
        // Column already exists (fresh DB, or a prior boot), so ignore.
      }
    }
    // The uniqueness guard the plugin can't add via ALTER on an existing table.
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON user(username)')
  } catch (err) {
    console.error('[doot] profile-column migration failed:', err)
  }
})
