/** Create a saved game from an editor composition. Requires a session; the
 *  game is owned by the current user. Returns its shareable id. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody(event)
  const parsed = gameInputSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid game', data: parsed.error.issues })
  }
  const { id } = await createGame(parsed.data, (user as { id: string }).id)
  setResponseStatus(event, 201)
  return { id }
})
