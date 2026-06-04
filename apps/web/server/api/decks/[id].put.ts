/** Update a deck in place (full edit) - owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const parsed = deckInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid deck', data: parsed.error.issues })
  }
  const updated = await updateDeck(id, user.id, parsed.data)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
  return { id }
})
