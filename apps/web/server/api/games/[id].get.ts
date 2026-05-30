/** Fetch one saved game by id (its full composition, for hosting). Private
 *  games are visible only to their owner. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const user = await optionalUser(event)
  const game = await getGame(id, user?.id ?? null)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  // Non-owners never receive answer keys (withholding holds for the API too).
  // The owner gets the full config so they can host/edit it.
  if (game.ownerId !== (user?.id ?? null)) game.config = redactConfigForViewer(game.config)
  return game
})
