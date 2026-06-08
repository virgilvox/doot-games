/**
 * Real-browser smoke for Spectrum (the consensus dial) against a running dev server.
 * Two players drag the dial to different spots; the host reveals the marks + the
 * consensus line, and the phone shows a positive score. 0 horizontal overflow at
 * 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/spectrum-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}
/** Set a range input's value and fire @input (Playwright's drag is unreliable on range). */
async function setDial(page, value) {
  await page.locator('.dial-range').evaluate((el, v) => {
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Spectrum: two players place the dial; the host reveals the consensus')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/spectrum`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    const players = []
    for (const [name, val] of [['Ana', 40], ['Ben', 60]]) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ page: p, name, val })
    }
    ok('2 players joined')

    await host.click('button:has-text("Start game")')
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')

    for (const { page: p, val } of players) {
      await p.waitForSelector('.dial-range', { timeout: 40000 })
      await setDial(p, val)
      await noOverflow(p, 'spectrum input')
      await p.click('button:has-text("Lock it in")')
      await p.waitForSelector('text=Locked in', { timeout: 40000 })
    }
    ok('both players placed the dial (40 and 60 -> consensus 50)')

    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')

    // The host shows the consensus line + the marks.
    await host.waitForSelector('.spectrum-host .mean', { timeout: 40000 })
    ok('host reveal shows the consensus line')
    // Each player is 10 off the consensus -> a positive score.
    const score = (await players[0].page.textContent('.spectrum-reveal h2')) ?? ''
    if (!/You scored [1-9]/.test(score)) throw new Error(`expected a positive score, got: ${score}`)
    await noOverflow(players[0].page, 'spectrum reveal')
    ok(`player reveal: "${score.trim()}"`)

    console.log('\nPASS: spectrum-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
