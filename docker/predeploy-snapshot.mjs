/**
 * Pre-deploy database snapshot. The deploy job pipes this into the RUNNING app
 * container (`docker compose exec -T app node --input-type=module < this`) right
 * before it pulls and starts the new image, so the copy is taken BEFORE the new
 * code runs its startup migrations. The hourly Spaces backup can be up to an hour
 * old, and the post-boot baseline runs after migrations, so neither covers that gap.
 *
 * VACUUM INTO goes through the same libSQL engine that writes the DB, so the copy
 * is transaction-consistent while the app keeps serving. It lands next to the live
 * file under the data volume (`/app/.data/predeploy/`), so a restore needs no
 * download. The job keeps the newest few and prunes the rest.
 *
 * Resolves @libsql/client from the bundled server output by absolute path, so it
 * works against the image that is currently running (old or new).
 *
 * Env: SNAPSHOT_LABEL (e.g. the commit sha being deployed).
 * Prints the snapshot path on success; exits non-zero on any failure, which
 * aborts the deploy (set -e) before anything changes.
 */
import { mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const { createClient } = await import('/app/.output/server/node_modules/@libsql/client/lib-esm/node.js')

const raw = (process.env.DATABASE_URL || '').trim()
const url = raw?.startsWith('file:') ? raw : 'file:./.data/doot.sqlite'
const src = resolve('/app', url.slice('file:'.length))
statSync(src) // throws (non-zero exit) if the live DB isn't where we expect

const dir = '/app/.data/predeploy'
mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const label = (process.env.SNAPSHOT_LABEL || 'manual').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40)
const out = `${dir}/${stamp}-${label}.sqlite`

const live = createClient({ url: `file:${src}` })
try {
  await live.execute(`VACUUM INTO '${out.replace(/'/g, "''")}'`)
} finally {
  live.close()
}

const copy = createClient({ url: `file:${out}` })
try {
  const check = await copy.execute('PRAGMA quick_check')
  const verdict = check.rows[0]?.quick_check ?? Object.values(check.rows[0] ?? {})[0]
  if (verdict !== 'ok') throw new Error(`snapshot quick_check failed: ${verdict}`)
  const users = await copy.execute('SELECT count(*) AS n FROM user')
  const games = await copy.execute('SELECT count(*) AS n FROM games')
  console.log(`snapshot ok: ${out} (${statSync(out).size} bytes, users=${users.rows[0].n}, games=${games.rows[0].n})`)
} finally {
  copy.close()
}
