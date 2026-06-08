/**
 * Smoke for durable session lineups (playlists) against a running dev server.
 * Part 1 (fetch): sign up, create a playlist, read it back, list mine, confirm a
 * private one is hidden from another user, and delete. Part 2 (browser): host a
 * saved (unlisted) lineup by id and confirm it runs the saved games (picker
 * skipped). Run:
 *   pnpm dev   # in one shell
 *   node scripts/playlists-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

function jar() {
  const cookies = new Map()
  return {
    header: () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb: (res) => {
      const sc = res.headers.getSetCookie?.() ?? []
      for (const c of sc) {
        const pair = c.split(';')[0]
        const i = pair.indexOf('=')
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1))
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
  let json = null
  try {
    json = await res.json()
  } catch {
    /* no body */
  }
  return { status: res.status, json }
}
async function signup(label) {
  const c = jar()
  const email = `smoke_${label}_${Date.now()}@example.com`
  const r = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email, password: 'test-pw-123456', name: label },
    cookie: c,
  })
  if (r.status >= 400) throw new Error(`signup ${label} failed: ${r.status} ${JSON.stringify(r.json)}`)
  return c
}

async function run() {
  step('Playlists API: create, read, list, visibility, delete')
  const owner = await signup('plowner')
  const other = await signup('plother')

  // Create an UNLISTED lineup (hostable by link without login) + a PRIVATE one.
  const made = await api('/api/playlists', {
    method: 'POST',
    cookie: owner,
    body: { name: 'Friday Night', games: ['categories', 'would-you-rather'], visibility: 'unlisted' },
  })
  if (made.status !== 201 || !made.json?.id) throw new Error(`create failed: ${made.status} ${JSON.stringify(made.json)}`)
  const id = made.json.id
  ok(`created unlisted playlist ${id}`)

  const got = await api(`/api/playlists/${id}`, { cookie: owner })
  if (got.json?.games?.join(',') !== 'categories,would-you-rather') throw new Error(`games mismatch: ${JSON.stringify(got.json)}`)
  if (got.json?.isOwner !== true) throw new Error('owner should be isOwner')
  ok('owner reads it back with the saved games in order')

  const mine = await api('/api/playlists?scope=mine', { cookie: owner })
  if (!mine.json?.playlists?.some((p) => p.id === id)) throw new Error('scope=mine missing the playlist')
  ok('it appears in the owner\'s list')

  // A bad game id is rejected.
  const bad = await api('/api/playlists', { method: 'POST', cookie: owner, body: { name: 'Bad', games: ['not-a-game'] } })
  if (bad.status !== 400) throw new Error(`expected 400 for an unknown game, got ${bad.status}`)
  ok('an unknown game id is rejected (400)')

  // A PRIVATE lineup is hidden from another user (and from anonymous).
  const priv = await api('/api/playlists', { method: 'POST', cookie: owner, body: { name: 'Secret', games: ['categories'], visibility: 'private' } })
  const privId = priv.json.id
  const otherView = await api(`/api/playlists/${privId}`, { cookie: other })
  if (otherView.status !== 404) throw new Error(`a private playlist must 404 for another user, got ${otherView.status}`)
  const anonView = await api(`/api/playlists/${privId}`)
  if (anonView.status !== 404) throw new Error(`a private playlist must 404 for anon, got ${anonView.status}`)
  ok('a private lineup is hidden from others + anonymous')

  // Delete (owner) -> then 404.
  const del = await api(`/api/playlists/${id}`, { method: 'DELETE', cookie: owner })
  if (del.status >= 400) throw new Error(`delete failed: ${del.status}`)
  const afterDel = await api(`/api/playlists/${id}`, { cookie: owner })
  if (afterDel.status !== 404) throw new Error(`deleted playlist should 404, got ${afterDel.status}`)
  ok('owner can delete it (then it 404s)')

  // Part 2: host a fresh unlisted lineup by id in a browser.
  step('Host a saved lineup by id (the picker is skipped)')
  const host = await api('/api/playlists', {
    method: 'POST',
    cookie: owner,
    body: { name: 'Host Me', games: ['categories', 'would-you-rather'], visibility: 'unlisted' },
  })
  const hostId = host.json.id
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext()).newPage()
    await page.goto(`${BASE}/host/playlist/${hostId}`)
    // It goes straight to game 1's lobby: the session bar shows "Game 1/2", the
    // Categories game's host lobby renders, and the setup picker is NOT shown.
    await page.waitForSelector('.chip:has-text("Game 1/2")', { timeout: 40000 })
    await page.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    if (await page.locator('.pick').count()) throw new Error('the game picker should be skipped for a saved lineup')
    ok('hosting the saved lineup loads game 1 directly (no picker)')
  } finally {
    await browser.close()
  }

  console.log('\nPASS: playlists-smoke')
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
