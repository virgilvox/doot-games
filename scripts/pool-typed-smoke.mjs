/**
 * End-to-end smoke for the TYPED deck-fed pools (Phase 2): a creator attaches a
 * multi-column deck (with an answer column) to a typed flagship like Fib Finder, and
 * the answer column must be withheld from a non-owner on the play read (invariant #3),
 * while the owner keeps it (so the host can withhold-then-reveal):
 *  1. sign up two throwaway accounts (owner + non-owner)
 *  2. owner creates a private Quiz Deck (question + truth columns)
 *  3. owner remixes fib-finder, attaching the deck under the reserved `pool` key
 *  4. GET ?for=play as OWNER     -> pool ref inlined, `truth` present
 *  5. GET ?for=play as NON-OWNER -> pool ref inlined, `truth` column NULL (question kept)
 */
const BASE = process.env.BASE ?? 'http://localhost:3000'

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

async function signup(label) {
  const c = jar()
  const email = `smoke_${label}_${Date.now()}@example.com`
  const r = await api('/api/auth/sign-up/email', { method: 'POST', body: { email, password: 'test-pw-123456', name: label }, cookie: c })
  if (r.status >= 400) throw new Error(`signup ${label} failed: ${r.status} ${JSON.stringify(r.json)}`)
  return c
}

const ok = (cond, msg) => console.log(`${cond ? '✓' : '✗'} ${msg}`)
let failed = false
const check = (cond, msg) => {
  if (!cond) failed = true
  ok(cond, msg)
}

const owner = await signup('owner')
const other = await signup('other')

// 2. owner builds a private Quiz Deck (question + truth). It stays private; only the
//    resolved + redacted game is shared.
const deck = await api('/api/decks', {
  method: 'POST',
  cookie: owner,
  body: {
    name: 'Smoke Fib Facts',
    kind: 'quiz',
    visibility: 'private',
    columns: [
      { key: 'question', label: 'Question', type: 'text' },
      { key: 'truth', label: 'Truth', type: 'text' },
    ],
    rows: [
      { question: 'A group of crows is a ___', truth: 'murder' },
      { question: 'The fastest land animal is the ___', truth: 'cheetah' },
    ],
  },
})
check(deck.status === 201 && deck.json.id?.startsWith('lib_'), `quiz deck created (${deck.json.id})`)
const deckId = deck.json.id

// 3. owner remixes fib-finder, attaching the deck under the reserved `pool` key.
const game = await api('/api/games', {
  method: 'POST',
  cookie: owner,
  body: {
    pluginId: 'fib-finder',
    visibility: 'unlisted', // so the non-owner can read it by link
    config: {
      title: 'Smoke Fib Remix',
      rounds: [{ block: 'quip', content: {} }], // vestigial; the host rebuilds from the deck
      decks: { pool: { ref: deckId } },
    },
  },
})
check(game.status === 201 && game.json.id, `fib-finder remix created (${game.json.id})`)
const gameId = game.json.id

// 4. OWNER play read: pool ref inlined, truth present.
const ownerView = await api(`/api/games/${gameId}?for=play`, { cookie: owner })
const ownerDeck = ownerView.json.config?.decks?.pool
check('inline' in (ownerDeck ?? {}), 'owner: pool reference resolved to inline')
const ownerTruth = ownerDeck?.inline?.rows?.[0]?.truth
check(ownerTruth === 'murder', `owner: answer (truth) present in resolved pool deck (${ownerTruth})`)

// 5. NON-OWNER play read: pool ref inlined, truth column NULL, question kept.
const otherView = await api(`/api/games/${gameId}?for=play`, { cookie: other })
const otherDeck = otherView.json.config?.decks?.pool
check('inline' in (otherDeck ?? {}), 'non-owner: pool reference resolved to inline')
const otherRow = otherDeck?.inline?.rows?.[0] ?? {}
check(otherRow.truth === null, `non-owner: answer column (truth) withheld (null), got ${JSON.stringify(otherRow.truth)}`)
check(otherRow.question === 'A group of crows is a ___', 'non-owner: non-answer column (question) still present')

console.log(`\n=== RESULT ===\ntyped pool deck remix + answer withholding: ${failed ? 'FAIL' : 'PASS'}`)
process.exit(failed ? 1 : 0)
