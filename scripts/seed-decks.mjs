/**
 * Seed (and re-seed) the public "Decks by Doot" library. Idempotent: it upserts each
 * deck from decks-by-doot.data.mjs by NAME under a stable Doot account, so running it
 * again updates the decks in place instead of duplicating them. Every deck is saved
 * public + remixable so anyone can remix a pool game with it.
 *
 * Usage:
 *   DOOT_PASSWORD=... node scripts/seed-decks.mjs            # localhost:3000
 *   BASE=https://doot.games DOOT_PASSWORD=... node scripts/seed-decks.mjs
 *
 * Env:
 *   BASE           target origin (default http://localhost:3000)
 *   DOOT_EMAIL     the Doot account email (default decks@doot.games)
 *   DOOT_PASSWORD  the Doot account password (required; used to sign in, or to create
 *                  the account the first time)
 *   DOOT_NAME      display name for new accounts (default Doot)
 *
 * Note: an answer-bearing deck (the quiz/card decks) is public here on purpose so it is
 * remixable. The per-game serve redaction still withholds answers from non-owner hosts
 * of a remix; the source deck itself is a shared content bank, by design.
 */
import { DECKS } from './decks-by-doot.data.mjs'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const EMAIL = process.env.DOOT_EMAIL ?? 'decks@doot.games'
const PASSWORD = process.env.DOOT_PASSWORD
const NAME = process.env.DOOT_NAME ?? 'Doot'

if (!PASSWORD) {
  console.error('Set DOOT_PASSWORD (the Doot account password) before running.')
  process.exit(2)
}

/**
 * Structural pre-flight on the deck content (pure, no game imports): catches the
 * mistakes that would silently degrade a deck (a dropped row = fewer rounds). Required
 * columns per typed game must be present and non-empty in every row; a single-column
 * deck must have no duplicate rows. Mirrors what each game's `fromRow` needs.
 */
const REQUIRED = {
  'fib-finder': ['question', 'truth'],
  ballpark: ['prompt', 'answer'],
  'what-you-didnt-know': ['prompt', 'options', 'correct'],
  faker: ['category', 'word'],
}
function validate(decks) {
  const errs = []
  const names = new Set()
  for (const d of decks) {
    if (names.has(d.name)) errs.push(`duplicate deck name: ${d.name}`)
    names.add(d.name)
    if (!d.rows.length) errs.push(`${d.name}: no rows`)
    const need = REQUIRED[d.game]
    if (need) {
      d.rows.forEach((r, i) => {
        for (const k of need) {
          const v = r[k]
          if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) errs.push(`${d.name} row ${i}: missing "${k}"`)
        }
        if (d.game === 'what-you-didnt-know' && typeof r.options === 'string' && r.options.split('|').filter((x) => x.trim()).length < 2) {
          errs.push(`${d.name} row ${i}: needs at least 2 options`)
        }
      })
    }
    if (d.columns.length === 1) {
      const key = d.columns[0].key
      const seen = new Set()
      for (const r of d.rows) {
        if (seen.has(r[key])) errs.push(`${d.name}: duplicate row "${r[key]}"`)
        seen.add(r[key])
      }
    }
  }
  return errs
}

const problems = validate(DECKS)
if (problems.length) {
  console.error(`Deck content has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
  process.exit(2)
}
console.log(`Validated ${DECKS.length} decks (no missing columns, no duplicate rows).`)

function jar() {
  const cookies = new Map()
  return {
    header: () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb: (res) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';')
        const i = pair.indexOf('=')
        cookies.set(pair.slice(0, i), pair.slice(i + 1))
      }
    },
  }
}

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie: cookie.header() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (cookie) cookie.absorb(res)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

async function authenticate() {
  const c = jar()
  const inn = await api('/api/auth/sign-in/email', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, cookie: c })
  if (inn.status < 400) {
    console.log(`Signed in as ${EMAIL}.`)
    return c
  }
  const up = await api('/api/auth/sign-up/email', { method: 'POST', body: { email: EMAIL, password: PASSWORD, name: NAME }, cookie: c })
  if (up.status < 400) {
    console.log(`Created the Doot account ${EMAIL}.`)
    return c
  }
  throw new Error(`Could not sign in or sign up ${EMAIL}: ${inn.status}/${up.status} ${JSON.stringify(up.json)}`)
}

async function existingByName(cookie) {
  const r = await api('/api/decks?scope=mine', { cookie })
  const map = new Map()
  for (const d of r.json?.decks ?? []) map.set(d.name, d.id)
  return map
}

const cookie = await authenticate()
const owned = await existingByName(cookie)

let created = 0
let updated = 0
let failed = 0
for (const deck of DECKS) {
  const body = {
    name: deck.name,
    description: deck.description,
    kind: deck.kind,
    visibility: 'public',
    remixable: true,
    columns: deck.columns,
    rows: deck.rows,
  }
  const id = owned.get(deck.name)
  const res = id
    ? await api(`/api/decks/${id}`, { method: 'PUT', body, cookie })
    : await api('/api/decks', { method: 'POST', body, cookie })
  if (res.status >= 400) {
    failed++
    console.log(`  x ${deck.name} (${deck.rows.length} rows) -> ${res.status} ${JSON.stringify(res.json)}`)
  } else if (id) {
    updated++
    console.log(`  ~ updated ${deck.name} (${deck.rows.length} rows)`)
  } else {
    created++
    console.log(`  + created ${deck.name} (${deck.rows.length} rows) -> ${res.json.id}`)
  }
}

console.log(`\n=== Decks by Doot: ${created} created, ${updated} updated, ${failed} failed (${DECKS.length} total) ===`)
process.exit(failed ? 1 : 0)
