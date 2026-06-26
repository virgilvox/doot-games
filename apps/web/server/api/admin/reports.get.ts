/** List post-game content reports for the admin Reports queue. Admins only. */
import { requireAdmin } from '../../utils/admin'
import { type ReportStatus, REPORT_STATUSES } from '../../utils/db'
import { listReports, openReportCount } from '../../utils/reports-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const status = REPORT_STATUSES.includes(q.status as ReportStatus) ? (q.status as ReportStatus) : undefined
  return { reports: await listReports({ status }), openCount: await openReportCount() }
})
