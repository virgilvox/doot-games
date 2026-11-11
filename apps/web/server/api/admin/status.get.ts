/** System status for the admin console: last DB backup, startup-migration readiness,
 *  and recent errors. Admins only. */
import { requireAdmin } from '../../utils/admin'
import { readiness } from '../../utils/migration-status'
import { backupStatus, recentErrors } from '../../utils/observability'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { now: Date.now(), backup: backupStatus(), migrations: readiness(), errors: recentErrors(50) }
})
