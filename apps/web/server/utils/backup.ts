/**
 * Database backup: snapshot the libSQL/SQLite store and upload it (PRIVATE) to
 * object storage (DigitalOcean Spaces in prod, MinIO locally).
 *
 * Why VACUUM INTO and not Litestream: Litestream streams the SQLite `-wal` file and
 * must share checkpoint control with the writer, but we run libSQL, which has its
 * own virtual-WAL implementation (Litestream documents no libSQL support, and
 * v0.5.6/0.5.7 had a silent replication-loss bug). `VACUUM INTO` runs through the
 * SAME libSQL engine that writes the DB and produces a transaction-consistent,
 * compacted copy - zero external-tool/WAL-format risk. See docs/deploy.md.
 *
 * The snapshot contains better-auth's tables (emails + argon2id password hashes),
 * so it is uploaded with a PRIVATE ACL via {@link uploadPrivateObject}, never public.
 */
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { createClient } from '@libsql/client'
import { databaseUrl } from './db'
import { isStorageConfigured, uploadPrivateObject } from './storage'

const gz = promisify(gzip)
const p2 = (n: number) => String(n).padStart(2, '0')

/**
 * Take one backup and upload it. Returns the object key on success, or null when
 * skipped: storage not configured, or the DB is not a local `file:` database (a
 * remote `libsql://`/Turso URL has its own managed backups and can't be VACUUMed to
 * a local path). Throws on a real failure (the caller logs it).
 */
export async function runBackup(): Promise<string | null> {
  const url = databaseUrl()
  if (!isStorageConfigured()) return null
  if (!url.startsWith('file:')) return null

  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`
  const tmp = join(tmpdir(), `doot-backup-${stamp}-${process.pid}.sqlite`)

  // VACUUM INTO: online, consistent, compacted snapshot through libSQL itself.
  const client = createClient({ url })
  try {
    await client.execute(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
  } finally {
    client.close()
  }

  try {
    const body = await gz(await readFile(tmp))
    const key = `backups/db/${now.getUTCFullYear()}/${p2(now.getUTCMonth() + 1)}/${p2(now.getUTCDate())}/${stamp}.sqlite.gz`
    await uploadPrivateObject(key, 'application/gzip', new Uint8Array(body))
    return key
  } finally {
    await rm(tmp, { force: true })
  }
}
