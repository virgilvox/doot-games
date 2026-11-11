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
//    ListObjectsV2 returns at most 1000 keys per page in ascending order, so we MUST
//    follow the continuation token: hourly backups pass 1000 objects in ~41 days,
//    and stopping at page one would silently pick a weeks-old snapshot as "latest".
const keys = []
let token = ''
do {
  const page = token ? `&continuation-token=${encodeURIComponent(token)}` : ''
  const listUrl = `${endpoint}/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000${page}`
  const listRes = await aws.fetch(listUrl, { method: 'GET' })
  if (!listRes.ok) {
    console.error(`List failed (${listRes.status}):`, await listRes.text())
    process.exit(1)
  }
  const xml = await listRes.text()
  for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) if (m[1].endsWith('.sqlite.gz')) keys.push(m[1])
  token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || '' : ''
} while (token)
keys.sort()
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

console.log(`
To restore on the droplet (as the deploy user, in /opt/doot):
  1. docker compose stop app
  2. mv data/doot.sqlite data/doot.sqlite.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)
     (keep the current file; never overwrite it in place)
  3. rm -f data/doot.sqlite-journal data/doot.sqlite-wal data/doot.sqlite-shm
     (a leftover journal would be "rolled back" INTO the restored file and corrupt it)
  4. cp ${outPath} data/doot.sqlite
  5. docker compose start app
Verify /api/ready and that Your Games / accounts are present.

A snapshot taken right before each deploy is also kept locally on the droplet in
data/predeploy/ (newest 10); restore one the same way, skipping the download.`)
if (verdict !== 'ok') process.exit(2)
