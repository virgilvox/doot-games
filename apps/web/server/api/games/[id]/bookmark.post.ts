/** Save this game to the current user's bookmarks (C12). Idempotent. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  // Only bookmark a game the user can actually see (visibility-enforced), so a
  // bookmark can't be used to probe for a hidden game's existence.
  const game = await getGame(id, user.id)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  await addBookmark(user.id, id)
  return { bookmarked: true }
})
