/** Moderate a deck: change its visibility (e.g. take it down to `private`). Admins only. */
import { requireAdmin } from '../../../../utils/admin'
import { adminSetDeckVisibility } from '../../../../utils/admin-repo'
import { VISIBILITIES, type Visibility } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing deck id.' })
  const body = await readBody<{ visibility?: string }>(event)
  if (!VISIBILITIES.includes(body?.visibility as Visibility)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visibility.' })
  }
  const ok = await adminSetDeckVisibility(id, body.visibility as Visibility)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Deck not found.' })
  return { ok: true }
})
