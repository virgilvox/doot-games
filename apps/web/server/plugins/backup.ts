/**
 * Schedule periodic database backups (see server/utils/backup.ts). Runs a baseline
 * shortly after boot (so every deploy captures a fresh copy) then hourly. Single-
 * flight so a slow upload can't overlap the next tick. No-op unless storage is
 * configured AND the DB is a local `file:` database, so dev without Spaces/MinIO is
 * untouched; set DOOT_BACKUP_DISABLED=1 to force off, BACKUP_INTERVAL_MS to retune.
 */
import { runBackup } from '../utils/backup'
import { databaseUrl } from '../utils/db'
import { recordBackupFail, recordBackupOk } from '../utils/observability'
import { isStorageConfigured } from '../utils/storage'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000 // hourly

export default defineNitroPlugin(() => {
  if (process.env.DOOT_BACKUP_DISABLED === '1') return
  if (!isStorageConfigured() || !databaseUrl().startsWith('file:')) return

  const interval = Number(process.env.BACKUP_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const key = await runBackup()
      if (key) {
        console.info(`[doot] db backup uploaded: ${key}`)
        recordBackupOk(key)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[doot] db backup FAILED:', msg)
      recordBackupFail(msg)
    } finally {
      running = false
    }
  }
  // Baseline ~30s after boot, then on the interval. Unref so neither timer keeps the
  // process alive on shutdown.
  const first = setTimeout(tick, 30_000)
  const repeat = setInterval(tick, interval)
  first.unref?.()
  repeat.unref?.()
})
