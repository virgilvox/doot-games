/**
 * Whether the current request is from an admin. Never 401s (the nav + admin page
 * poll it for everyone, including signed-out visitors); just reports the boolean.
 * The real gate is `requireAdmin` on every other admin route, not this.
 */
import { isAdmin } from '../../utils/admin'
import { optionalUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const user = await optionalUser(event)
  if (!user) return { admin: false }
  return { admin: await isAdmin(user) }
})
