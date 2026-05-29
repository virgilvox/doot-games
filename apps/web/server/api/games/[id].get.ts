/** Fetch one saved game by id (its full composition, for hosting). Private
 *  games are visible only to their owner. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const session = await getUserSession(event)
  const requesterId = (session.user as { id?: string } | undefined)?.id ?? null
  const game = await getGame(id, requesterId)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return game
})
