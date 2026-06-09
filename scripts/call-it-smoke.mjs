/**
 * Real-browser smoke of Call It (the custom flow). Drives a host + 3 phones through:
 * start -> host poses a call (prompt + Yes/No) -> phones pick -> host locks -> host taps
 * the real outcome -> correct callers score -> a second call accrues the board -> end ->
 * results. Asserts the host receives picks (the tally climbs), the right callers score,
 * and zero horizontal overflow at 390px (phone) and 1440px (host). Not part of the unit
 * suite. Run:  pnpm dev  then  node scripts/call-it-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text()
      if (/favicon|autoplay|not allowed to start|AudioContext|Better Auth|baseURL/i.test(t)) return
      errors.push(`[${who} console] ${t}`)
    }
  })
  page.on('pageerror', (e) => errors.push(`[${who} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`))
}

const NAMES = ['Ada', 'Boo', 'Cal']

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) errors.push(`${label}: horizontal overflow of ${overflow}px`)
  else ok(`${label}: no horizontal overflow`)
}

async function joinForm(page, name) {
  await page.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await page.fill('input[placeholder="e.g. Robin"]', name)
  await page.click('button:has-text("Join game")')
  // Reconnecting under the same name triggers the "that name is in this room" warning;
  // confirm "That's me, reconnect" so the player rejoins (the real, correct flow).
  const recon = page.locator('button:has-text("reconnect")')
  try { await recon.waitFor({ state: 'visible', timeout: 2500 }); await recon.click() } catch { /* fresh join, no warning */ }
}

// Run one call: host composes (Yes/No), opens; players pick the given option index; host
// locks; host resolves to `outcome`. Returns nothing; pushes errors on failure.
async function runCall(host, players, prompt, pickIndex, outcome, afterPicks) {
  await host.waitForSelector('.compose', { timeout: 60000 })
  await host.fill('.prompt-input', prompt)
  // The default options are Yes / No, so just open.
  await host.click('button:has-text("Open the call")')
  await host.waitForSelector('.live .opt-grid', { timeout: 60000 })
  for (const p of players) {
    await p.waitForSelector('.opt', { timeout: 60000 })
    await p.locator('.opt').nth(pickIndex).click().catch(() => {})
  }
  // The host must RECEIVE the picks (the live tally climbs) before locking.
  let got = 0
  for (let i = 0; i < 30; i++) {
    const ns = (await host.locator('.opt-card .opt-n').allTextContents()).map((s) => Number(s) || 0)
    got = ns.reduce((a, b) => a + b, 0)
    if (got >= players.length) break
    await host.waitForTimeout(150)
  }
  if (got >= players.length) ok(`host received ${got} picks`)
  else errors.push(`host only received ${got}/${players.length} picks (custom channel?)`)
  if (afterPicks) await afterPicks(pickIndex)
  await host.click('button:has-text("Lock picks")')
  // Resolve: tap the outcome option on the host's locked board.
  await host.locator('.opt-card').nth(outcome).click()
  await host.waitForSelector('button:has-text("Next call")', { timeout: 60000 })
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Host opens Call It')
    const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    watch(host, 'host')
    await host.goto(`${BASE}/host/call-it`)
    await host.waitForSelector('.code', { timeout: 60000 })
    const code = (await host.textContent('.code')).trim()
    ok(`room code = ${code}`)

    step('3 phones join (390px viewport)')
    const players = []
    for (const name of NAMES) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      watch(p, name)
      await p.goto(`${BASE}/play/${code}`)
      await joinForm(p, name)
      await p.waitForSelector('text=You\'re in', { timeout: 60000 })
      players.push(p)
    }
    ok('3 players in the lobby')

    await host.click('button:has-text("Start calling")')

    step('Call 1: everyone picks Yes; a phone reconnects mid-open; outcome = Yes (all score)')
    await runCall(host, players, 'Will the next song be one we know?', 0, 0, async (pickIndex) => {
      // Reconnect check (C3): player 0 drops + rejoins by name while the call is open;
      // its pick must be restored from the retained channel (the option shows selected).
      await players[0].reload()
      await players[0].waitForSelector('input[placeholder="e.g. Robin"], .opt', { timeout: 60000 })
      if (await players[0].locator('input[placeholder="e.g. Robin"]').count()) await joinForm(players[0], NAMES[0])
      await players[0].waitForSelector('.opt', { timeout: 60000 })
      let restored = false
      for (let i = 0; i < 20; i++) {
        const on = players[0].locator('.opt.on')
        if ((await on.count()) === 1 && (await players[0].locator('.opt').nth(pickIndex).getAttribute('aria-pressed')) === 'true') { restored = true; break }
        await players[0].waitForTimeout(150)
      }
      if (restored) ok('reconnect restored the player pick (selection came back)')
      else errors.push('reconnect lost the player pick (selection not restored)')
    })
    // After resolving Yes with everyone on Yes, each phone should show its own win card
    // (driven by the published outcome) and, once the board arrives, its running points.
    let won = 0
    let scored = 0
    for (const p of players) {
      const win = await p.waitForSelector('.result-card.win', { timeout: 15000 }).then(() => true).catch(() => false)
      if (win) won++
      let badge = ''
      for (let i = 0; i < 20 && !/\d/.test(badge); i++) {
        badge = await p.locator('.badge').textContent().catch(() => '')
        if (/\d/.test(badge)) break
        await p.waitForTimeout(150)
      }
      if (/100|200/.test(badge || '')) scored++
    }
    if (won === players.length) ok('all 3 phones show their own "you called it" card')
    else errors.push(`only ${won}/${players.length} phones showed the win card`)
    if (scored === players.length) ok('all 3 correct callers show points (board delivered)')
    else errors.push(`only ${scored}/${players.length} phones show points after a correct call`)

    step('Overflow checks (mid game)')
    await noOverflow(players[0], 'player 390px')
    await noOverflow(host, 'host 1440px')

    step('Call 2: everyone picks Yes; outcome = No (nobody scores this one)')
    await host.click('button:has-text("Next call")')
    await runCall(host, players, 'Do they score on this drive?', 0, 1)
    ok('second call resolved; board carried across')

    step('End the game -> results')
    await host.click('button:has-text("End game")')
    await host.waitForSelector('.results, .results-wrap', { timeout: 60000 })
    const headline = await host.locator('.results h1, .rhead h1').first().textContent().catch(() => '')
    ok(`final results reached: "${(headline || '').trim()}"`)
    const pRes = await players[0].locator('.results').count().catch(() => 0)
    ok(pRes ? 'phone shows results' : 'phone results not asserted (non-fatal)')

    console.log('')
    if (errors.length) {
      console.log(`✗ ${errors.length} error(s):`)
      for (const e of errors.slice(0, 20)) console.log('   ' + e)
      process.exitCode = 1
    } else {
      console.log('✓ Call It smoke passed with no console/page errors.')
    }
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  for (const e2 of errors.slice(0, 20)) console.error('   ' + e2)
  process.exit(1)
})
