/** List saved games (most recent first) for discovery. */
export default defineEventHandler(async () => {
  const games = await listGames()
  return { games }
})
