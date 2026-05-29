/** Create a saved game from an editor composition. Returns its shareable id. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = gameInputSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid game', data: parsed.error.issues })
  }
  const { id } = await createGame(parsed.data)
  setResponseStatus(event, 201)
  return { id }
})
