/**
 * Solo Tier List block flow smoke. The tier block now OWNS its round and runs the
 * item-by-item show itself. Headless players read `/x/tiershow` and vote each item via
 * the STANDARD round input (room.submit of a growing placements map); the host drives
 * the block's own Reveal / Next item / Wrap up controls, then the standard Final results.
 *
 * Part A: the flagship (one tier round) at scale. Part B: a [tier, poll] game to prove
 * the block advances to a following round of a different type.
 *
 *   pnpm dev   then   node_modules/.bin/jiti scripts/tier-flow-smoke.mjs
 *   HEADLESS=40 PHONES=1 SHOTS=1
 */
import { chromium } from 'playwright'
import { createClaspRelay, createRoom } from '@doot-games/engine'

const _log = console.log.bind(console)
console.log = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('CLASP ')) return
  _log(...a)
}

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEADLESS = Number(process.env.HEADLESS ?? 40)
const PHONES = Number(process.env.PHONES ?? 1)
const RELAY = process.env.RELAY_URL || 'wss://relay.clasp.to'
const SHOTS = process.env.SHOTS === '1'
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/doot-tierflow'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}
function chooseTier(name, idx, tierCount) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  const base = Math.min(tierCount - 1, idx % tierCount)
  return (h + idx) % 4 === 0 ? Math.min(tierCount - 1, Math.max(0, base + ((h % 2) ? 1 : -1))) : base
}

/** A headless player that votes each tier item over the standard input. */
function makeVoter(code, name, relays) {
  const relay = createClaspRelay(RELAY)
  relays.push(relay)
  const p = createRoom({ relay, room: code, role: 'player', name })
  const placements = {}
  let votes = 0
  p.onExtra('tiershow', (s) => {
    if (!s || s.phase !== 'voting') return
    const snap = p.getSnapshot()
    const round = snap.config?.rounds?.[snap.round?.index ?? 0]
    const items = round?.content?.items
    const tierCount = round?.content?.tiers?.length ?? 5
    const item = items?.[Number(s.index) || 0]
    if (!item || placements[item.id] != null) return
    placements[item.id] = chooseTier(name, Number(s.index) || 0, tierCount)
    p.submit({ placements: { ...placements } })
    votes++
  })
  return { p, voteCount: () => votes }
}

/** Click whichever tier control is showing; returns what it did. */
async function step(host) {
  await host.waitForSelector(
    'button:has-text("Reveal"), button:has-text("Next item"), button:has-text("Wrap up"), button:has-text("Final results"), button:has-text("Next round")',
    { timeout: 40000 },
  )
  if (await host.locator('button:has-text("Reveal")').count()) {
    await sleep(1300) // let headless votes land
    await host.locator('button:has-text("Reveal")').first().click()
    return 'reveal'
  }
  if (await host.locator('button:has-text("Wrap up")').count()) {
    await host.locator('button:has-text("Wrap up")').first().click()
    return 'wrap'
  }
  if (await host.locator('button:has-text("Next item")').count()) {
    await host.locator('button:has-text("Next item")').first().click()
    return 'next-item'
  }
  if (await host.locator('button:has-text("Final results")').count()) {
    await host.locator('button:has-text("Final results")').first().click()
    return 'final'
  }
  if (await host.locator('button:has-text("Next round")').count()) {
    await host.locator('button:has-text("Next round")').first().click()
    return 'next-round'
  }
  return 'none'
}

async function partA(browser) {
  console.log(`\n== Part A: flagship at ${HEADLESS} headless + ${PHONES} phones ==`)
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errs = []
  host.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
  await host.goto(`${BASE}/host/tier-list`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  console.log(`room ${code}`)

  const relays = []
  const voters = []
  for (let i = 0; i < HEADLESS; i += 10) {
    const batch = Array.from({ length: Math.min(10, HEADLESS - i) }, (_, k) => makeVoter(code, `Bot${String(i + k + 1).padStart(3, '0')}`, relays))
    voters.push(...batch)
    await Promise.all(batch.map((v) => v.p.connect().catch((e) => fails.push(`spawn: ${e.message}`))))
    await sleep(400)
  }
  await sleep(2500)

  const phones = []
  for (let i = 0; i < PHONES; i++) {
    const ph = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
    try {
      await ph.goto(`${BASE}/play/${code}`)
      await ph.waitForSelector('input', { timeout: 40000 })
      await ph.fill('input[placeholder="e.g. Robin"]', `Phone${i + 1}`)
      await ph.click('button:has-text("Join game")')
      await ph.waitForSelector('text=You\'re in', { timeout: 40000 })
      phones.push(ph)
    } catch (e) {
      fails.push(`phone: ${e.message.split('\n')[0]}`)
    }
  }
  console.log(`joined: ${voters.length} headless, ${phones.length} phones`)

  await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
  await host.click('button:has-text("Start game")')

  let items = 0
  for (let guard = 0; guard < 40; guard++) {
    if (SHOTS && guard === 2) {
      const { mkdirSync } = await import('node:fs')
      mkdirSync(SHOT_DIR, { recursive: true })
      await host.screenshot({ path: `${SHOT_DIR}/host-voting.png` })
      if (phones[0]) await phones[0].screenshot({ path: `${SHOT_DIR}/phone-voting.png`, fullPage: true })
    }
    const did = await step(host)
    if (guard < 6 || did !== 'next-item') console.log(`  step ${guard}: ${did}`)
    if (did === 'reveal') items++
    if (did === 'final' || did === 'none') break
    if (did === 'wrap' && SHOTS) await host.screenshot({ path: `${SHOT_DIR}/host-board.png` })
  }
  await sleep(1500)
  if (SHOTS) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(SHOT_DIR, { recursive: true })
    await host.screenshot({ path: `${SHOT_DIR}/host-results.png` })
  }
  const headline = await host.evaluate(() => document.querySelector('.rhead h1, .results h1, h1')?.textContent?.trim() ?? '(none)')
  console.log(`  results headline: "${headline}"`)
  const atResults = await host.locator('text=/wins|read the room|board is set|results are|Play again/i').count()
  if (!atResults) fails.push('never reached results')
  const ov = await host.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const totalVotes = voters.reduce((a, v) => a + v.voteCount(), 0)
  console.log(`items revealed ${items}, headless votes ${totalVotes}`)
  ok(items >= 3, `drove multiple items (${items})`)
  ok(totalVotes >= HEADLESS * 2, `headless voted via standard input (${totalVotes})`)
  ok(ov === 0, `host no horizontal overflow (${ov})`)
  ok(errs.length === 0, `no host errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`)
  for (const v of voters) try { v.p.dispose() } catch { /* */ }
  for (const r of relays) try { r.close() } catch { /* */ }
}

async function partB(browser) {
  console.log('\n== Part B: [tier, poll] advance to a following round ==')
  const email = `tieradv_${Date.now()}@doot.dev`
  const su = await fetch(`${BASE}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email, password: 'supersecret123', name: 'adv' }) })
  const cookie = (su.headers.get('set-cookie') || '').split(';')[0]
  const game = {
    pluginId: 'custom',
    visibility: 'unlisted',
    config: {
      title: 'Tier then Poll',
      rounds: [
        { block: 'tier', content: { prompt: 'Where does it go?', timer: 8, scored: true, tiers: [{ label: 'S', color: '#ff6b6b' }, { label: 'A', color: '#ffa94d' }, { label: 'B', color: '#ffd43b' }], items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }, { id: 'c', label: 'Charlie' }] } },
        { block: 'poll', content: { prompt: 'Best of the three?', timer: null, options: [{ label: 'Alpha' }, { label: 'Bravo' }, { label: 'Charlie' }] } },
      ],
    },
  }
  const res = await fetch(`${BASE}/api/games`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: JSON.stringify(game) })
  if (!res.ok) { fails.push(`save 2-round game ${res.status}`); return }
  const { id } = await res.json()
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errs = []
  host.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
  await host.goto(`${BASE}/host/g/${id}`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  const relays = []
  const voters = Array.from({ length: 5 }, (_, i) => makeVoter(code, `Adv${i + 1}`, relays))
  await Promise.all(voters.map((v) => v.p.connect()))
  await sleep(2500)
  await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
  await host.click('button:has-text("Start game")')
  // Run the tier block to completion (3 items), then it should reach the poll round.
  let reachedPoll = false
  for (let guard = 0; guard < 30; guard++) {
    // The poll round uses the generic stage: its prompt "Best of the three?" appears.
    if (await host.locator('text=Best of the three?').count()) { reachedPoll = true; break }
    const did = await step(host)
    if (did === 'none') break
    if (did === 'next-round') { reachedPoll = true; break }
  }
  ok(reachedPoll, 'tier block finished its items and advanced to the poll round')
  ok(errs.length === 0, `no host errors in 2-round game${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`)
  for (const v of voters) try { v.p.dispose() } catch { /* */ }
  for (const r of relays) try { r.close() } catch { /* */ }
}

;(async () => {
  const browser = await chromium.launch()
  try {
    await partA(browser)
    await partB(browser)
  } finally {
    await browser.close()
  }
  console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL GREEN')
  process.exit(fails.length ? 1 : 0)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
