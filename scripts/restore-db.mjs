/**
 * Restore (or inspect) a Doot database backup from object storage.
 *
 * Lists the private `backups/db/` snapshots, downloads the latest (or BACKUP_KEY),
 * gunzips it, writes a local `.sqlite`, and runs PRAGMA integrity_check + row counts
 * so you can verify a backup is good. It does NOT overwrite the live DB; it prints
 * the swap-in steps. Backup objects are private, so this signs its own requests.
 *
 * Env: SPACES_ENDPOINT, SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET
 *      (optional) BACKUP_KEY=backups/db/.../<stamp>.sqlite.gz to pick a specific one
 *      (optional) BACKUP_PREFIX (default backups/db/)
 * Usage: node scripts/restore-db.mjs [out-path]   (default ./restored-doot.sqlite)
 */
import { writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createClient } from '@libsql/client'
import { AwsClient } from 'aws4fetch'

const endpoint = (process.env.SPACES_ENDPOINT || '').replace(/\/$/, '')
const bucket = process.env.SPACES_BUCKET
const region = process.env.SPACES_REGION || 'us-east-1'
const accessKey = process.env.SPACES_KEY
const secretKey = process.env.SPACES_SECRET
if (!endpoint || !bucket || !accessKey || !secretKey) {
  console.error('Set SPACES_ENDPOINT, SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET first.')
  process.exit(1)
}

const aws = new AwsClient({ accessKeyId: accessKey, secretAccessKey: secretKey, region, service: 's3' })
const prefix = process.env.BACKUP_PREFIX || 'backups/db/'
const outPath = process.argv[2] || './restored-doot.sqlite'

// 1. Find the newest backup. Keys are timestamped, so lexicographic max = newest.
const listUrl = `${endpoint}/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`
const listRes = await aws.fetch(listUrl, { method: 'GET' })
if (!listRes.ok) {
  console.error(`List failed (${listRes.status}):`, await listRes.text())
  process.exit(1)
}
const xml = await listRes.text()
const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]).filter((k) => k.endsWith('.sqlite.gz')).sort()
if (!keys.length) {
  console.error(`No backups found under ${prefix}.`)
  process.exit(1)
}
const chosen = process.env.BACKUP_KEY || keys[keys.length - 1]
console.log(`Found ${keys.length} backup(s); using: ${chosen}`)

// 2. Download + gunzip.
const objRes = await aws.fetch(`${endpoint}/${bucket}/${chosen}`, { method: 'GET' })
if (!objRes.ok) {
  console.error(`Download failed (${objRes.status}).`)
  process.exit(1)
}
const bytes = gunzipSync(Buffer.from(await objRes.arrayBuffer()))
writeFileSync(outPath, bytes)
console.log(`Wrote ${bytes.length} bytes -> ${outPath}`)

// 3. Verify it opens cleanly and report row counts.
const c = createClient({ url: `file:${outPath}` })
const integ = await c.execute('PRAGMA integrity_check')
const verdict = integ.rows[0]?.integrity_check ?? integ.rows[0]?.[0]
console.log(`integrity_check: ${verdict}`)
for (const t of ['games', 'decks', 'playlists', 'bookmarks', 'user', 'session']) {
  try {
    const r = await c.execute(`SELECT count(*) AS n FROM ${t}`)
    console.log(`  ${t}: ${r.rows[0].n}`)
  } catch {
    console.log(`  ${t}: (absent)`)
  }
}
c.close()

console.log(
  `\nTo restore on the droplet:\n  1. docker compose down (or stop the app container)\n  2. cp ${outPath} /opt/doot/data/doot.sqlite\n  3. docker compose up -d\nVerify /api/health and that Your Games / accounts are present.`,
)
if (verdict !== 'ok') process.exit(2)
