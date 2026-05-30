/** Whether the editor should offer file uploads (storage configured + signed in). */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  return { enabled: isStorageConfigured() && !!session.user }
})
