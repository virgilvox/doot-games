/** Delete a saved game — owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const deleted = await deleteGame(id, user.id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return { ok: true }
})
