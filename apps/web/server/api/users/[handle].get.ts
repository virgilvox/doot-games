/**
 * Public profile by @handle: the account's display name, handle, avatar, bio,
 * and its publicly listed games. Never exposes the email. A leading `@` in the
 * route param is stripped. An unknown/unclaimed handle 404s so we don't confirm
 * whether an account exists.
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'handle')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Missing handle' })
  const handle = decodeURIComponent(raw).replace(/^@/, '')
  const profile = await getPublicProfileByHandle(handle)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  const games = await listPublicGamesByOwner(profile.id)
  // Don't expose the internal account id to the client; the @handle is the public
  // key and the page doesn't need the id.
  const { id: _id, ...publicProfile } = profile
  return { profile: publicProfile, games }
})
