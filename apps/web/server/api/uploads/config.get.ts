/** Whether the editor should offer file uploads (object storage configured).
 *  The upload itself still requires a session (presign is gated). */
export default defineEventHandler(() => {
  return { enabled: isStorageConfigured() }
})
