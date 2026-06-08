/** Delete any deck (owner-agnostic). Admins only. */
import { requireAdmin } from '../../../utils/admin'
import { adminDeleteDeck } from '../../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing deck id.' })
  const ok = await adminDeleteDeck(id)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Deck not found.' })
  return { ok: true }
})
