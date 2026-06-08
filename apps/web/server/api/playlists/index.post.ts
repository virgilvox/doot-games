/** Create a session lineup ("playlist"). Requires a session; owned by the user. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = playlistInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid playlist', data: parsed.error.issues })
  }
  const { id } = await createPlaylist(parsed.data, user.id)
  setResponseStatus(event, 201)
  return { id }
})
