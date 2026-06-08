/**
 * Block a suspended (banned) account from the content-write surface. A moderation
 * primitive: an admin can ban a user from the console, after which that account can
 * no longer create/edit/publish games or decks, or upload images.
 *
 * Only acts on write methods to the content paths, and only when a session is
 * present, so it never changes the anonymous flows (hosting/playing need no account,
 * and the anonymous play-count ping is explicitly skipped). Each route keeps its own
 * `requireUser` 401 for the signed-out case; this only adds the 403-when-banned rule
 * in one place so no current or future write route can forget it.
 */
import { assertNotBanned } from '../utils/admin'
import { optionalUser } from '../utils/session'

const GUARDED = ['/api/games', '/api/decks', '/api/uploads']

export default defineEventHandler(async (event) => {
  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const path = event.path || ''
  if (!GUARDED.some((p) => path.startsWith(p))) return
  // The play-count ping is anonymous + harmless; don't make it pay a session lookup.
  if (/^\/api\/games\/[^/]+\/play\b/.test(path)) return

  const user = await optionalUser(event)
  if (user) await assertNotBanned(user)
})
