/** Whether the editor should offer file uploads (storage configured + signed in). */
export default defineEventHandler(async (event) => {
  const user = await optionalUser(event)
  return { enabled: isStorageConfigured() && !!user }
})
