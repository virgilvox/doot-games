/** Fetch one saved game by id (its full composition, for hosting). Private
 *  games are visible only to their owner. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const user = await optionalUser(event)
  const game = await getGame(id, user?.id ?? null)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  const isOwner = !!game.ownerId && game.ownerId === user?.id
  // Non-owners never receive answer keys (withholding holds for the API too).
  // The owner gets the full config so they can host/edit it.
  if (!isOwner) game.config = redactConfigForViewer(game.config)
  // Credit the author by display name (never their email), and surface their
  // @handle so the byline can link to /u/@handle when they've claimed one.
  const author = game.ownerId ? (await authorsFor([game.ownerId])).get(game.ownerId) : undefined
  // Whether the signed-in viewer has this game bookmarked (drives the save toggle).
  const bookmarked = user ? await isBookmarked(user.id, id) : false
  // Show the @handle when claimed; only fall back to the display name otherwise
  // (never expose the email-derived name once a handle exists).
  return {
    ...game,
    isOwner,
    bookmarked,
    authorName: author?.handle ? null : (author?.name ?? null),
    authorHandle: author?.handle ?? null,
  }
})
