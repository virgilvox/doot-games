/** Fetch one deck by id (full columns + rows, for editing or use). Private decks
 *  are visible only to their owner. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const user = await optionalUser(event)
  const deck = await getDeck(id, user?.id ?? null)
  if (!deck) throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
  const isOwner = !!deck.ownerId && deck.ownerId === user?.id
  const author = deck.ownerId ? (await authorsFor([deck.ownerId])).get(deck.ownerId) : undefined
  return {
    ...deck,
    isOwner,
    authorName: author?.handle ? null : (author?.name ?? null),
    authorHandle: author?.handle ?? null,
  }
})
