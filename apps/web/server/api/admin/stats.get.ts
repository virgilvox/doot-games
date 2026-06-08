/** Platform metrics for the admin overview. Admins only. */
import { requireAdmin } from '../../utils/admin'
import { getStats } from '../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await getStats()
})
