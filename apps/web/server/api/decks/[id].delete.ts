/** Delete a deck, owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const deleted = await deleteDeck(id, user.id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
  return { ok: true }
})
