/** Delete a playlist, owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const deleted = await deletePlaylist(id, user.id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Playlist not found' })
  return { ok: true }
})
