// Visual audit harness: drive Bingo + Call It to key states and screenshot them at
// phone (390) + host (1440) widths. Not a test. Run against a dev server.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:3001'
const DIR = '/tmp/audit'
mkdirSync(DIR, { recursive: true })
const NAMES = ['Ada', 'Boo', 'Cal']

async function join(browser, code, name) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
  await p.goto(`${BASE}/play/${code}`)
  await p.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await p.fill('input[placeholder="e.g. Robin"]', name)
  await p.click('button:has-text("Join game")')
  await p.waitForSelector("text=You're in", { timeout: 60000 })
  return p
}

async function shot(page, name) {
  await page.screenshot({ path: `${DIR}/${name}.png` })
  console.log(`  shot ${name}`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    // ---------- BINGO (Party pack = longest items, 5x5) ----------
    const bh = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await bh.goto(`${BASE}/host/bingo`)
    await bh.waitForSelector('.code', { timeout: 60000 })
    const bcode = (await bh.textContent('.code')).trim()
    await shot(bh, 'bingo-host-lobby')
    const bp = []
    for (const n of NAMES) bp.push(await join(browser, bcode, n))
    await bh.click('button:has-text("Party Bingo")').catch(() => {})
    await bh.click('button:has-text("Start bingo")')
    await bh.waitForSelector('button:has-text("Call the first item")', { timeout: 60000 })
    await bp[0].waitForSelector('.grid .cell', { timeout: 60000 })
    await shot(bp[0], 'bingo-player-card-5x5-party-nocalls')
    // Call 8 items, marking player 0's ready cells each time.
    for (let i = 0; i < 8; i++) {
      await bh.locator('button:has-text("Call the")').first().click().catch(() => {})
      await bh.waitForTimeout(150)
      const ready = bp[0].locator('.cell.ready')
      const n = await ready.count()
      for (let k = 0; k < n; k++) await ready.nth(0).click().catch(() => {})
    }
    await shot(bp[0], 'bingo-player-card-marked')
    await shot(bh, 'bingo-host-midgame')
    // Keep calling until player 0 can claim, then screenshot the claim button.
    for (let i = 0; i < 40; i++) {
      if (await bp[0].locator('.bingo-btn').count()) break
      await bh.locator('button:has-text("Call the")').first().click().catch(() => {})
      await bh.waitForTimeout(120)
      const ready = bp[0].locator('.cell.ready')
      const n = await ready.count()
      for (let k = 0; k < n; k++) await ready.nth(0).click().catch(() => {})
    }
    await shot(bp[0], 'bingo-player-bingo-button')

    // ---------- CALL IT ----------
    const ch = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await ch.goto(`${BASE}/host/call-it`)
    await ch.waitForSelector('.code', { timeout: 60000 })
    const ccode = (await ch.textContent('.code')).trim()
    const cp = []
    for (const n of NAMES) cp.push(await join(browser, ccode, n))
    await ch.click('button:has-text("Start calling")')
    await ch.waitForSelector('.compose', { timeout: 60000 })
    await shot(ch, 'callit-host-compose')
    await ch.fill('.prompt-input', 'Will the next person through that door be carrying a drink in their right hand?')
    await ch.click('button:has-text("Open the call")')
    await ch.waitForSelector('.live .opt-grid', { timeout: 60000 })
    await cp[0].waitForSelector('.opt', { timeout: 60000 })
    await shot(cp[0], 'callit-player-open')
    await cp[0].locator('.opt').nth(0).click()
    await cp[1].locator('.opt').nth(1).click()
    await ch.waitForTimeout(500)
    await shot(ch, 'callit-host-live')
    await ch.click('button:has-text("Lock picks")')
    await ch.locator('.opt-card').nth(0).click()
    await ch.waitForSelector('button:has-text("Next call")', { timeout: 60000 })
    await shot(ch, 'callit-host-result')
    await cp[0].waitForSelector('.result-card', { timeout: 60000 })
    await shot(cp[0], 'callit-player-result-win')
    await shot(cp[1], 'callit-player-result-lose')
    console.log('done')
  } finally {
    await browser.close()
  }
}
run().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
