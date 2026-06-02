/** The current user's saved (bookmarked) games, newest save first (C12). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { games: await listBookmarkedGames(user.id) }
})
