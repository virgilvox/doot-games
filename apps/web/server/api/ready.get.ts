/**
 * Readiness probe: 200 only once this boot's startup migrations (app tables +
 * better-auth tables) have finished with no real failure, and the database
 * answers a query. 503 otherwise.
 *
 * This is NOT the container HEALTHCHECK (that stays the cheap, DB-free
 * /api/health, so a transient DB blip never flaps the proxy). The deploy job polls
 * this after `docker compose up` and rolls back to the previous image when it
 * never turns green, so a broken migration can't sit in production behind a green
 * liveness check. Failure details are logged server-side; the body only names the
 * failing step.
 */
import { sql } from 'drizzle-orm'
import { useDb } from '../utils/db'
import { readiness } from '../utils/migration-status'

export default defineEventHandler(async (event) => {
  try {
    // Triggers ensureSchema on a fresh process, and proves the DB is readable.
    const db = await useDb()
    await db.run(sql`SELECT 1`)
  } catch {
    setResponseStatus(event, 503)
    return { status: 'not-ready', reason: 'database-unavailable' }
  }
  const r = readiness()
  if (r.ready) return { status: 'ready' }
  setResponseStatus(event, 503)
  return r.reason === 'starting'
    ? { status: 'not-ready', reason: 'starting', pending: r.pending }
    : { status: 'not-ready', reason: 'migration-failed', steps: [...new Set(r.failures.map((f) => f.step))] }
})
