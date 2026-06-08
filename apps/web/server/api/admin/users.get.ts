/** List accounts for the admin Users tab. Admins only. `?q=` searches email/name/handle. */
import { requireAdmin } from '../../utils/admin'
import { listUsers } from '../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event).q
  return { users: await listUsers({ q: typeof q === 'string' ? q : undefined }) }
})
