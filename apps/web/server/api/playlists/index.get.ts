/**
 * List playlists. `?scope=mine` returns the current user's lineups (any visibility;
 * anonymous callers get none); the default lists publicly-listed ones.
 */
export default defineEventHandler(async (event) => {
  if (getQuery(event).scope === 'mine') {
    const user = await optionalUser(event)
    return { playlists: user ? await listMyPlaylists(user.id) : [] }
  }
  return { playlists: await listPublicPlaylists() }
})
