/**
 * List saved games. `?scope=mine` returns the current user's games (any
 * visibility; requires a session); the default lists publicly-listed games for
 * discovery.
 */
export default defineEventHandler(async (event) => {
  const scope = getQuery(event).scope
  if (scope === 'mine') {
    const user = await requireUser(event)
    return { games: await listMyGames(user.id) }
  }
  return { games: await listPublicGames() }
})
