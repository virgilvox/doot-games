import { getMigrations } from 'better-auth/db/migration'
import { authOptions } from '../utils/auth'

/**
 * Create/extend better-auth's tables at startup so the app stays zero-config
 * (no separate migration step). `getMigrations` diffs the schema and
 * `runMigrations` applies only what's missing, so it's idempotent.
 */
export default defineNitroPlugin(async () => {
  try {
    const { runMigrations } = await getMigrations(authOptions)
    await runMigrations()
  } catch (err) {
    console.error('[doot] auth schema migration failed:', err)
  }
})
