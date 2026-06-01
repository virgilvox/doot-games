import { createClient } from '@libsql/client'
import { getMigrations } from 'better-auth/db/migration'
import { authOptions } from '../utils/auth'
import { databaseUrl } from '../utils/db'

/**
 * Create/extend better-auth's tables at startup so the app stays zero-config
 * (no separate migration step). `getMigrations` diffs the schema and
 * `runMigrations` applies only what's missing, so it's idempotent.
 *
 * The username plugin + the `bio` additionalField need three columns on `user`.
 * On a FRESH database `runMigrations` adds them as part of CREATE TABLE. On an
 * EXISTING `user` table (every deployed instance), SQLite rejects
 * `ALTER TABLE ... ADD COLUMN username` because the plugin marks it UNIQUE
 * ("Cannot add a UNIQUE column"), so `runMigrations` throws and the columns are
 * never added. We follow it with a manual, SQLite-safe additive migration:
 * plain columns plus a separate UNIQUE INDEX. Both run every boot and are
 * idempotent. Column names match better-auth's camelCase convention
 * (`displayUsername`, not snake_case).
 */
export default defineNitroPlugin(async () => {
  try {
    const { runMigrations } = await getMigrations(authOptions)
    await runMigrations()
  } catch (err) {
    // Expected on an existing table (the UNIQUE-column add); the fallback below
    // adds the profile columns. Log at a low level so a real failure is visible.
    console.warn('[doot] auth runMigrations reported:', err instanceof Error ? err.message : err)
  }

  // Manual fallback: add the profile columns the username plugin / bio field need.
  try {
    const client = createClient({ url: databaseUrl() })
    for (const ddl of [
      'ALTER TABLE user ADD COLUMN username TEXT',
      'ALTER TABLE user ADD COLUMN displayUsername TEXT',
      'ALTER TABLE user ADD COLUMN bio TEXT',
    ]) {
      try {
        await client.execute(ddl)
      } catch {
        // Column already exists (fresh DB, or a prior boot) — ignore.
      }
    }
    // The uniqueness guard the plugin can't add via ALTER on an existing table.
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON user(username)')
  } catch (err) {
    console.error('[doot] profile-column migration failed:', err)
  }
})
