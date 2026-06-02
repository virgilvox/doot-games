/** Remove this game from the current user's bookmarks (C12). Idempotent. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  await removeBookmark(user.id, id)
  return { bookmarked: false }
})
