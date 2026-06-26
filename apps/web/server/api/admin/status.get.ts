/** System status for the admin console: last DB backup + recent errors. Admins only. */
import { requireAdmin } from '../../utils/admin'
import { backupStatus, recentErrors } from '../../utils/observability'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { now: Date.now(), backup: backupStatus(), errors: recentErrors(50) }
})
