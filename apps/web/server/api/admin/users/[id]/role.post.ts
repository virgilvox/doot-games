/**
 * Promote or demote a user (set role to 'admin' or 'user'). Admins only. An admin
 * can't demote themselves (so the console can't be left with zero admins by accident).
 */
import { requireAdmin } from '../../../../utils/admin'
import { setUserRole } from '../../../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id.' })
  const body = await readBody<{ role?: string }>(event)
  const role = body?.role
  if (role !== 'admin' && role !== 'user') {
    throw createError({ statusCode: 400, statusMessage: "role must be 'admin' or 'user'." })
  }
  if (id === admin.id && role === 'user') {
    throw createError({ statusCode: 400, statusMessage: 'You cannot remove your own admin access.' })
  }
  const ok = await setUserRole(id, role)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  return { ok: true, role }
})
