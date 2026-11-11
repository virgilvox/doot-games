/**
 * Startup schema-migration status, so a failed migration is LOUD instead of a
 * green healthcheck followed by runtime 500s.
 *
 * Two independent steps migrate the database at boot: the app tables
 * (`ensureSchema` in db.ts, run on first `useDb()`) and better-auth's tables
 * (`server/plugins/auth-migrate.ts`). Both run additive DDL that is expected to
 * fail harmlessly on a redeploy ("duplicate column", "already exists"). Anything
 * else is a real failure: it is recorded here, logged, and turns `/api/ready` red,
 * which the deploy job waits on (and rolls back on).
 *
 * In-memory per process, like observability.ts: it describes THIS boot.
 */

export type MigrationStep = 'app-schema' | 'auth-schema'

const STEPS: readonly MigrationStep[] = ['app-schema', 'auth-schema']

const done = new Set<MigrationStep>()
const failures: { step: MigrationStep; message: string; at: number }[] = []

/**
 * True when a DDL error is the expected, harmless outcome of re-running an
 * additive migration on a database that already has the change. Deliberately
 * narrow: disk-full, "database is locked", syntax errors, a missing table and so
 * on are NOT benign and must surface.
 */
export function isBenignMigrationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /duplicate column|already exists|cannot add a unique column|duplicate index/i.test(msg)
}

/** Record a real migration failure (also logs it, loudly). */
export function recordMigrationFailure(step: MigrationStep, err: unknown, statement?: string): void {
  const message = err instanceof Error ? err.message : String(err)
  failures.push({ step, message: message.slice(0, 500), at: Date.now() })
  console.error(`[doot] ${step} migration FAILED${statement ? ` (${statement.slice(0, 120)})` : ''}:`, message)
}

/**
 * Run one additive DDL statement, swallowing only the benign "already applied"
 * errors. Returns false when the statement really failed (already recorded).
 */
export async function runAdditive(
  step: MigrationStep,
  exec: (sql: string) => Promise<unknown>,
  sql: string,
): Promise<boolean> {
  try {
    await exec(sql)
    return true
  } catch (err) {
    if (isBenignMigrationError(err)) return true
    recordMigrationFailure(step, err, sql)
    return false
  }
}

export function markMigrationDone(step: MigrationStep): void {
  done.add(step)
}

export type Readiness =
  | { ready: true }
  | { ready: false; reason: 'starting'; pending: MigrationStep[] }
  | { ready: false; reason: 'migration-failed'; failures: { step: MigrationStep; message: string }[] }

/** Whether every startup migration finished without a real failure. */
export function readiness(): Readiness {
  if (failures.length) {
    return { ready: false, reason: 'migration-failed', failures: failures.map(({ step, message }) => ({ step, message })) }
  }
  const pending = STEPS.filter((s) => !done.has(s))
  if (pending.length) return { ready: false, reason: 'starting', pending }
  return { ready: true }
}

/** Test-only: reset the module state between cases. */
export function _resetMigrationStatus(): void {
  done.clear()
  failures.length = 0
}
