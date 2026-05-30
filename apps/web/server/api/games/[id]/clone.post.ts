/** Copy a game into a new one owned by the current user (your own game, or any
 *  game the owner marked forkable). Returns the new game's id. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  return cloneGame(id, user.id)
})
