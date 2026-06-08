/** Fetch one playlist by id (its ordered game ids). Private playlists are visible
 *  only to their owner; unlisted/public to anyone with the link (so a host can run
 *  an unlisted lineup without logging in). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const user = await optionalUser(event)
  const playlist = await getPlaylist(id, user?.id ?? null)
  if (!playlist) throw createError({ statusCode: 404, statusMessage: 'Playlist not found' })
  const isOwner = !!playlist.ownerId && playlist.ownerId === user?.id
  return { ...playlist, isOwner }
})
