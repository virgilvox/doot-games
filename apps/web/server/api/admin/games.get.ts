/** List every game (any visibility) for the admin Games tab. Admins only. */
import { requireAdmin } from '../../utils/admin'
import { listAllGames } from '../../utils/admin-repo'
import type { Visibility } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const sort = q.sort === 'recent' ? 'recent' : 'plays'
  const visibility =
    q.visibility === 'public' || q.visibility === 'unlisted' || q.visibility === 'private'
      ? (q.visibility as Visibility)
      : undefined
  return {
    games: await listAllGames({ sort, visibility, q: typeof q.q === 'string' ? q.q : undefined }),
  }
})
