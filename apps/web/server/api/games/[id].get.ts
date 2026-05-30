/** Fetch one saved game by id (its full composition, for hosting). Private
 *  games are visible only to their owner. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const user = await optionalUser(event)
  const game = await getGame(id, user?.id ?? null)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return game
})
