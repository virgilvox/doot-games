/** Whether the editor should offer file uploads. `enabled` reports object
 *  storage being configured; `signedIn` reports a session. The upload itself
 *  requires both (presign is session-gated), so the editor only shows the
 *  Upload control when storage is configured AND the author is signed in, and
 *  otherwise explains why instead of surfacing a 401. */
export default defineEventHandler(async (event) => {
  const user = await optionalUser(event)
  return { enabled: isStorageConfigured(), signedIn: !!user }
})
