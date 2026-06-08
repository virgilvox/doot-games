/** List every deck (any visibility) for the admin Decks tab. Admins only. */
import { requireAdmin } from '../../utils/admin'
import { listAllDecks } from '../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event).q
  return { decks: await listAllDecks({ q: typeof q === 'string' ? q : undefined }) }
})
