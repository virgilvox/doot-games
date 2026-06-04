/**
 * List decks from the library. `?scope=mine` returns the current user's decks (any
 * visibility; anonymous callers get none); the default lists publicly-listed decks.
 */
export default defineEventHandler(async (event) => {
  const scope = getQuery(event).scope
  if (scope === 'mine') {
    const user = await optionalUser(event)
    return { decks: user ? await listMyDecks(user.id) : [] }
  }
  return { decks: await listPublicDecks() }
})
