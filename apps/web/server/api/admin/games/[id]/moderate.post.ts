/**
 * Moderate a game: change its visibility (e.g. take it down to `private`) and/or
 * toggle the `featured` curation flag. Owner-agnostic. Admins only.
 */
import { requireAdmin } from '../../../../utils/admin'
import { adminSetGameFeatured, adminSetGameVisibility } from '../../../../utils/admin-repo'
import { VISIBILITIES, type Visibility } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing game id.' })
  const body = await readBody<{ visibility?: string; featured?: boolean }>(event)
  let changed = false
  if (body?.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility as Visibility)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid visibility.' })
    }
    changed = (await adminSetGameVisibility(id, body.visibility as Visibility)) || changed
  }
  if (typeof body?.featured === 'boolean') {
    changed = (await adminSetGameFeatured(id, body.featured)) || changed
  }
  if (!changed) throw createError({ statusCode: 404, statusMessage: 'Game not found, or nothing to change.' })
  return { ok: true }
})
