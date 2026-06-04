/** Create a deck in the library. Requires a session; owned by the current user. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = deckInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid deck', data: parsed.error.issues })
  }
  const { id } = await createDeck(parsed.data, user.id)
  setResponseStatus(event, 201)
  return { id }
})
