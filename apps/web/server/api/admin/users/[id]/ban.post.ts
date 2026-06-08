/**
 * Ban or unban a user. Admins only. A banned account is blocked from the
 * content-write surface (see server/middleware/ban-guard.ts). An admin can't ban
 * themselves.
 */
import { requireAdmin } from '../../../../utils/admin'
import { setUserBan } from '../../../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id.' })
  const body = await readBody<{ banned?: boolean; reason?: string }>(event)
  if (typeof body?.banned !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'banned must be a boolean.' })
  }
  if (id === admin.id && body.banned) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot ban your own account.' })
  }
  const ok = await setUserBan(id, body.banned, body.reason)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  return { ok: true, banned: body.banned }
})
