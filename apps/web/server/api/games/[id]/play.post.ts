/**
 * Record that a saved game was hosted: increment its play count and stamp the time.
 * Called best-effort by the host when a room actually starts (leaves the lobby), so
 * the number reflects games that really got played, not lobbies that were abandoned.
 *
 * No auth: hosting needs no account, so neither does this ping. It's a durable
 * HISTORICAL stat (PRD §1 permits those), not live room state, so nothing about the
 * in-progress room is written, only an aggregate counter on the game definition. The
 * per-IP write rate limit (server/middleware/rate-limit.ts) bounds abuse.
 */
import { recordPlay } from '../../../utils/admin-repo'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing game id.' })
  await recordPlay(id)
  return { ok: true }
})
