/**
 * End-to-end smoke for "remix a flagship with your prompts":
 *  1. sign up, create a Prompt Deck with distinctive prompts
 *  2. save a quip-clash game that attaches the deck under config.decks.pool
 *  3. GET the game ?for=play -> the pool ref resolves to inline, carrying the prompts
 * Proves the persistence + server resolution of an attached pool deck. (That buildConfig
 * then plays those rows is covered by packages/games buildconfig.test.ts; the host wiring
 * by typecheck.)
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
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    return { status: res.status, json: text }
  }
}

let failed = false
const check = (cond, msg) => {
  if (!cond) failed = true
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
}

const owner = jar()
const su = await api('/api/auth/sign-up/email', { method: 'POST', body: { email: `pool_${Date.now()}@example.com`, password: 'test-pw-123456', name: 'Pooler' }, cookie: owner })
if (su.status >= 400) throw new Error(`signup failed: ${su.status} ${JSON.stringify(su.json)}`)

const PROMPTS = ['SMOKE_PROMPT_ALPHA', 'SMOKE_PROMPT_BRAVO', 'SMOKE_PROMPT_CHARLIE']
const deck = await api('/api/decks', {
  method: 'POST',
  cookie: owner,
  body: { name: 'Smoke Prompts', kind: 'prompt', columns: [{ key: 'prompt', label: 'Prompt', type: 'text' }], rows: PROMPTS.map((prompt) => ({ prompt })) },
})
check(deck.status === 201 && deck.json.id?.startsWith('lib_'), `prompt deck created (${deck.json.id})`)

const game = await api('/api/games', {
  method: 'POST',
  cookie: owner,
  body: {
    pluginId: 'quip-clash',
    visibility: 'unlisted',
    config: { title: 'Quip Clash — Smoke', rounds: [{ block: 'quip', content: {} }], decks: { pool: { ref: deck.json.id } } },
  },
})
check(game.status === 201 && game.json.id, `quip-clash remix saved (${game.json.id})`)

const play = await api(`/api/games/${game.json.id}?for=play`, { cookie: owner })
const poolUse = play.json.config?.decks?.pool
check(poolUse && 'inline' in poolUse, 'pool ref resolved to inline on ?for=play')
const rows = poolUse?.inline?.rows ?? []
const prompts = rows.map((r) => r.prompt)
check(PROMPTS.every((p) => prompts.includes(p)), `resolved pool carries the creator prompts (${prompts.join(', ')})`)

console.log(`\n=== RESULT ===\npool remix persistence + resolution: ${failed ? 'FAIL' : 'PASS'}`)
process.exit(failed ? 1 : 0)
