/** Triage a report: move it to 'reviewed', 'dismissed', or back to 'open'. Admins only. */
import { requireAdmin } from '../../../utils/admin'
import { type ReportStatus, REPORT_STATUSES } from '../../../utils/db'
import { setReportStatus } from '../../../utils/reports-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing report id.' })
  const body = await readBody<{ status?: string }>(event)
  if (!REPORT_STATUSES.includes(body?.status as ReportStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })
  }
  const changed = await setReportStatus(id, body.status as ReportStatus)
  if (!changed) throw createError({ statusCode: 404, statusMessage: 'Report not found.' })
  return { ok: true }
})
