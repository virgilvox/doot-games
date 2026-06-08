/** Update a playlist in place - owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const parsed = playlistInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid playlist', data: parsed.error.issues })
  }
  const updated = await updatePlaylist(id, user.id, parsed.data)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Playlist not found' })
  return { id }
})
