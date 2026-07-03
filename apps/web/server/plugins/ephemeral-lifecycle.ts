/**
 * Ensure the object store expires ephemeral play blobs on its own (the "T" in the
 * ephemeral TTL). Runs once shortly after boot; idempotent and non-fatal, so a
 * transient storage hiccup never blocks startup. No-op unless storage is configured,
 * so dev without Spaces/MinIO is untouched. See server/utils/storage.ts and
 * docs/ephemeral-blobs.md. Set DOOT_EPHEMERAL_LIFECYCLE_DISABLED=1 to skip.
 */
import { ensureEphemeralLifecycle } from '../utils/storage'

export default defineNitroPlugin(() => {
  if (process.env.DOOT_EPHEMERAL_LIFECYCLE_DISABLED === '1') return
  if (!isStorageConfigured()) return

  // Defer briefly so it never contends with the boot path; fire and forget.
  setTimeout(() => {
    ensureEphemeralLifecycle()
      .then((result) => {
        if (result !== 'exists' && result !== 'skipped') {
          console.info(`[doot] ephemeral lifecycle rule ${result} on the object store`)
        }
      })
      .catch((err) => {
        console.warn('[doot] could not ensure ephemeral lifecycle rule (blobs will still work):', err)
      })
  }, 3_000)
})
