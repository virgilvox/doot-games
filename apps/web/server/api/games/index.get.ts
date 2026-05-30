/**
 * List saved games. `?scope=mine` returns the current user's games (any
 * visibility; requires a session); the default lists publicly-listed games for
 * discovery.
 */
export default defineEventHandler(async (event) => {
  const scope = getQuery(event).scope
  if (scope === 'mine') {
    // Anonymous callers simply have no games (don't 401 — the explore page
    // fetches this on every visit, including for logged-out users).
    const user = await optionalUser(event)
    return { games: user ? await listMyGames(user.id) : [] }
  }
  return { games: await listPublicGames() }
})
