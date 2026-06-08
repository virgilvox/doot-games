/** Delete any game (owner-agnostic), plus its bookmarks. Admins only. */
import { requireAdmin } from '../../../utils/admin'
import { adminDeleteGame } from '../../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing game id.' })
  const ok = await adminDeleteGame(id)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Game not found.' })
  return { ok: true }
})
