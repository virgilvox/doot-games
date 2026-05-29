/** Verify credentials and start a session. */
export default defineEventHandler(async (event) => {
  const parsed = credentialsSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid' })
  }
  const user = await authenticate(parsed.data)
  await setUserSession(event, { user })
  return { user }
})
