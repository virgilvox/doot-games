/**
 * Backup round-trip drill: proves the libSQL-specific backup path works WITHOUT any
 * network/MinIO. Creates a libSQL file DB, writes rows, takes a `VACUUM INTO`
 * snapshot WHILE the writer is open (online), gzip/gunzip round-trips it, then opens
 * the restored copy and asserts integrity_check = ok and the row count survived.
 * This is the genuinely risky bit (libSQL + VACUUM INTO); the upload leg reuses the
 * proven storage helper and is verified on prod. Run: node scripts/backup-drill.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createClient } from '@libsql/client'

const dir = mkdtempSync(join(tmpdir(), 'doot-drill-'))
const src = join(dir, 'src.sqlite')
const snap = join(dir, 'snap.sqlite')
const restored = join(dir, 'restored.sqlite')
let fail = 0
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fail++
}

try {
  const c = createClient({ url: `file:${src}` })
  await c.execute('CREATE TABLE games (id TEXT PRIMARY KEY, title TEXT)')
  for (let i = 0; i < 100; i++) {
    await c.execute({ sql: 'INSERT INTO games (id, title) VALUES (?, ?)', args: [`g${i}`, `Game ${i}`] })
  }
  // Online snapshot through libSQL itself, with the writer connection still open.
  await c.execute(`VACUUM INTO '${snap.replace(/'/g, "''")}'`)
  ok(true, 'VACUUM INTO produced a snapshot on libSQL (writer open)')
  c.close()

  // gzip -> gunzip round-trip (what the backup task ships and restore unpacks).
  writeFileSync(restored, gunzipSync(gzipSync(readFileSync(snap))))

  const r = createClient({ url: `file:${restored}` })
  const integ = await r.execute('PRAGMA integrity_check')
  const verdict = integ.rows[0]?.integrity_check ?? integ.rows[0]?.[0]
  ok(verdict === 'ok', `restored DB integrity_check = ok (got ${verdict})`)
  const cnt = await r.execute('SELECT count(*) AS n FROM games')
  ok(Number(cnt.rows[0].n) === 100, `restored row count = 100 (got ${cnt.rows[0].n})`)
  r.close()
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(fail ? `\nFAIL (${fail})` : '\nALL GREEN')
process.exit(fail ? 1 : 0)
