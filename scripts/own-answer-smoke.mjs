/**
 * Own-answer hiding smoke (E18): in a two-phase fill->vote (Mad Libs) and
 * fill->split (Split the Room) game, each player submits a distinctly-worded
 * fill, then we reach the judge round and assert NEITHER player is shown their
 * OWN filled story to vote on. Run: `pnpm dev`, then `node scripts/own-answer-smoke.mjs`.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

async function joinPlayer(ctx, code, name) {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => log(`[${name}] PAGEERROR`, e.message))
  await p.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
  await sleep(700)
  await p.getByLabel(/display name/i).fill(name).catch(() => {})
  await sleep(120)
  await p.getByRole('button', { name: /join game/i }).first().click().catch(() => {})
  await sleep(1400)
  return p
}

// Fill every blank input on a player's phone with `token`, then lock in.
async function fillAndLock(page, token) {
  const inputs = page.locator('.player input[type="text"], .player textarea, .fill input, .fill textarea')
  const n = await inputs.count()
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${token}${i}`).catch(() => {})
  await page.getByRole('button', { name: /lock it in/i }).first().click().catch(() => {})
}

async function runOne(browser, { slug, hostUrl, optionSel }) {
  log(`\n=== ${slug} ===`)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const host = await ctx.newPage()
  const hostErr = []
  host.on('console', (m) => m.type() === 'error' && hostErr.push(m.text()))
  host.on('pageerror', (e) => hostErr.push('PAGEERROR ' + e.message))
  await host.goto(hostUrl, { waitUntil: 'networkidle' })
  await sleep(2200)
  const code = (await host.locator('.code').first().innerText().catch(() => '')).trim()
  if (!code || code.length !== 4) { log('FAIL: no room code'); await ctx.close(); return false }
  log(`room: ${code}`)

  const pA = await joinPlayer(ctx, code, 'Aaa')
  const pB = await joinPlayer(ctx, code, 'Bbb')
  await sleep(1000)
  await host.getByRole('button', { name: /start (game|the cypher|cypher)/i }).first().click().catch(() => {})
  await sleep(1500)

  // Round 0 = fill (make). Drive the host's primary button + fill phones until the
  // judge round shows options on the phones. Distinct tokens so we can spot "own".
  let filledA = false
  let filledB = false
  for (let t = 0; t < 30; t++) {
    if (!filledA && (await pA.getByRole('button', { name: /lock it in/i }).count())) {
      await fillAndLock(pA, 'AAA'); filledA = true; log('A submitted fill')
    }
    if (!filledB && (await pB.getByRole('button', { name: /lock it in/i }).count())) {
      await fillAndLock(pB, 'BBB'); filledB = true; log('B submitted fill')
    }
    // Click the host's main action (Open / Lock / Start the vote / Reveal / Next).
    const btn = host.locator('.controlbar button, .stage button, button.btn-primary, button').filter({ hasText: /open|lock|start the vote|reveal|next|collect|voting/i }).first()
    if (await btn.count()) await btn.click().catch(() => {})
    await sleep(1200)

    const aOpts = await pA.locator(optionSel).allInnerTexts().catch(() => [])
    const bOpts = await pB.locator(optionSel).allInnerTexts().catch(() => [])
    if (aOpts.length && bOpts.length) {
      const aSeesOwn = aOpts.some((o) => o.includes('AAA'))
      const aSeesOther = aOpts.some((o) => o.includes('BBB'))
      const bSeesOwn = bOpts.some((o) => o.includes('BBB'))
      const bSeesOther = bOpts.some((o) => o.includes('AAA'))
      log(`A options: ${JSON.stringify(aOpts)}`)
      log(`B options: ${JSON.stringify(bOpts)}`)
      log(`A sees own=${aSeesOwn} other=${aSeesOther} | B sees own=${bSeesOwn} other=${bSeesOther}`)
      const pass = !aSeesOwn && aSeesOther && !bSeesOwn && bSeesOther && hostErr.length === 0
      log(`host errors: ${hostErr.length}${hostErr.length ? ' -> ' + hostErr.slice(0, 2).join(' | ') : ''}`)
      await ctx.close()
      return pass
    }
  }
  log('FAIL: never reached the judge round with options on both phones')
  await ctx.close()
  return false
}

const run = async () => {
  const browser = await chromium.launch()
  const r = {}
  r.madlibs = await runOne(browser, { slug: 'mad-libs (fill -> vote)', hostUrl: `${BASE}/host/mad-libs`, optionSel: '.opt, .vote-opt, [class*="option"]' })
  r.split = await runOne(browser, { slug: 'split-room (fill -> split)', hostUrl: `${BASE}/host/split-room`, optionSel: '.srow .stext' })
  await browser.close()
  log('\n=== RESULT ===')
  for (const [k, v] of Object.entries(r)) log(`${k} own-answer hidden: ${v ? 'PASS' : 'FAIL'}`)
  if (Object.values(r).some((v) => !v)) process.exit(1)
}

run().catch((e) => { console.error('smoke failed:', e); process.exit(1) })
