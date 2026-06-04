/**
 * End-to-end smoke for the /decks library + references:
 *  1. sign up a throwaway account (cookie session)
 *  2. create a library deck (question/answer columns)
 *  3. create a game that LINKS the deck (a guess round binds prompt + correct to it)
 *  4. GET the game ?for=play as the OWNER     -> ref inlined, answer present
 *  5. GET the game ?for=play as a NON-OWNER    -> ref inlined, answer column NULL
 * Proves: reference resolution at serve + binding-aware redaction (invariant #3).
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

// 2. create a deck
const deck = await api('/api/decks', {
  method: 'POST',
  cookie: owner,
  body: {
    name: 'Smoke Capitals',
    kind: 'quiz',
    columns: [
      { key: 'question', label: 'Question', type: 'text' },
      { key: 'answer', label: 'Answer', type: 'text' },
    ],
    rows: [{ question: 'Capital of France?', answer: 'Paris' }],
  },
})
check(deck.status === 201 && deck.json.id?.startsWith('lib_'), `deck created (${deck.json.id})`)
const deckId = deck.json.id

// 3. create a game that LINKS the deck (guess round binds prompt + correct)
const game = await api('/api/games', {
  method: 'POST',
  cookie: owner,
  body: {
    pluginId: 'custom',
    visibility: 'unlisted', // so the non-owner can read it by link
    config: {
      title: 'Smoke Ref Game',
      decks: { caps: { ref: deckId } },
      rounds: [
        {
          block: 'guess',
          content: { prompt: '', correct: '', options: [] },
          bindings: { prompt: { deck: 'caps', column: 'question' }, correct: { deck: 'caps', column: 'answer' } },
        },
      ],
    },
  },
})
check(game.status === 201 && game.json.id, `game created (${game.json.id})`)
const gameId = game.json.id

// 4. OWNER play read: ref inlined, answer present
const ownerView = await api(`/api/games/${gameId}?for=play`, { cookie: owner })
const ownerDeck = ownerView.json.config?.decks?.caps
check('inline' in (ownerDeck ?? {}), 'owner: reference resolved to inline')
const ownerAns = ownerDeck?.inline?.rows?.[0]?.answer
check(ownerAns === 'Paris', `owner: answer present in resolved deck (${ownerAns})`)

// 5. NON-OWNER play read: ref inlined, answer column NULL
const otherView = await api(`/api/games/${gameId}?for=play`, { cookie: other })
const otherDeck = otherView.json.config?.decks?.caps
check('inline' in (otherDeck ?? {}), 'non-owner: reference resolved to inline')
const otherRow = otherDeck?.inline?.rows?.[0] ?? {}
check(otherRow.answer === null, `non-owner: answer column withheld (null), got ${JSON.stringify(otherRow.answer)}`)
check(otherRow.question === 'Capital of France?', 'non-owner: non-answer column (prompt) still present')

// 6. fork auto-snapshot: the owner forks their own game; the referenced (private) deck
//    should be SNAPSHOTTED into the fork (inline), not left as a live ref.
const fork = await api(`/api/games/${gameId}/clone`, { method: 'POST', cookie: owner })
check(fork.status < 400 && fork.json.id, `fork created (${fork.json.id})`)
const forkRaw = await api(`/api/games/${fork.json.id}`, { cookie: owner }) // editor (raw) read
const forkDeck = forkRaw.json.config?.decks?.caps
check('inline' in (forkDeck ?? {}), 'fork: referenced deck snapshotted to inline (self-contained)')
check(forkDeck?.inline?.rows?.[0]?.answer === 'Paris', 'fork: snapshot carries the deck rows')

console.log(`\n=== RESULT ===\ndecks reference + redaction + fork-snapshot: ${failed ? 'FAIL' : 'PASS'}`)
process.exit(failed ? 1 : 0)
