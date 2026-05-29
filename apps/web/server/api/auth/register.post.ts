/** Create an account and start a session. */
export default defineEventHandler(async (event) => {
  const parsed = credentialsSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Invalid' })
  }
  const user = await registerUser(parsed.data)
  await setUserSession(event, { user })
  setResponseStatus(event, 201)
  return { user }
})
