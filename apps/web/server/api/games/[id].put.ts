/** Update a saved game in place (full edit) - owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const parsed = gameInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid game', data: parsed.error.issues })
  }
  const updated = await updateGame(id, user.id, parsed.data)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return { id }
})
