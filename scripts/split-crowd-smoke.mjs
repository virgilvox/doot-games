/**
 * Real-browser smoke for P4B on the SPLIT block (per-scenario yes/no). Hosts Split
 * the Room (fill -> split), turns "Let the crowd's votes count" ON, two players make
 * + vote, and a spectator uses the per-scenario yes/no audience surface on the scored
 * split round. Asserts the spectator gets that surface (only with the toggle on) and
 * the final leaderboard has ONLY the players. 0 horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/split-crowd-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Crowd toggle ON: a spectator votes yes/no per scenario on a SCORED split round')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/split-room`)
    await host.waitForSelector('.code', { timeout: 40000 })
    if (await host.locator('.round-opt').count()) await host.locator('.round-opt').first().click()
    await host.waitForSelector('.crowd-toggle', { timeout: 40000 })
    await host.locator('.crowd-toggle').check()
    if (!(await host.locator('.crowd-toggle').isChecked())) throw new Error('crowd toggle did not enable')
    const code = (await host.textContent('.code')).trim()
    ok('crowd toggle enabled in the lobby')

    const players = []
    for (const name of ['Ana', 'Bo']) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ name, page: p })
    }
    const aud = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await aud.goto(`${BASE}/play/${code}`)
    await aud.waitForSelector('.watch-link', { timeout: 40000 })
    await aud.click('.watch-link')
    await aud.waitForSelector("text=You're watching", { timeout: 40000 })
    ok('2 players joined and a spectator is watching')

    await host.click('button:has-text("Start game")')

    let sawSplitSurface = false
    for (let guard = 0; guard < 20; guard++) {
      const openBtn = host.locator('button:has-text("Open voting"), button:has-text("Collect answers")').first()
      await openBtn.waitFor({ timeout: 40000 })
      await openBtn.click()

      for (const p of players) {
        await p.page.waitForSelector('.fill-input, .srow', { timeout: 40000 })
        if (await p.page.locator('.fill-input').count()) {
          const inputs = p.page.locator('.fill-input')
          const n = await inputs.count()
          for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${p.name} would do ${guard}`)
        } else {
          // Split round: answer yes/no on every visible scenario.
          const rows = p.page.locator('.srow')
          const n = await rows.count()
          for (let i = 0; i < n; i++) await rows.nth(i).locator('.syn-btn.yes').click()
        }
        await p.page.click('button:has-text("Lock it in")')
      }

      // Spectator: the per-scenario yes/no surface appears only on the scored split round.
      if (await aud.locator('.aud-split').count()) {
        const scen = aud.locator('.aud-scenario')
        const n = await scen.count()
        for (let i = 0; i < n; i++) await scen.nth(i).locator('.yn-btn').first().click() // vote "Yes"
        await noOverflow(aud, 'spectator split vote (390px)')
        sawSplitSurface = true
      }

      const lockBtn = host.locator('button:has-text("Lock voting"), button:has-text("Lock answers")').first()
      await lockBtn.waitFor({ timeout: 40000 })
      await lockBtn.click()
      await host.waitForSelector('button:has-text("Start the vote"), button:has-text("Reveal")', { timeout: 40000 })
      if (await host.locator('button:has-text("Start the vote")').count()) {
        await host.click('button:has-text("Start the vote")')
        continue
      }
      await host.click('button:has-text("Reveal")')
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
      if (await host.locator('button:has-text("Final results")').count()) {
        await host.click('button:has-text("Final results")')
        break
      }
      await host.click('button:has-text("Next round")')
    }

    if (!sawSplitSurface) throw new Error('the spectator never got the per-scenario yes/no surface (split wiring broken)')
    ok('the spectator voted yes/no per scenario on a SCORED split round')

    await host.waitForSelector('.lb-row', { timeout: 40000 })
    const rows = await host.locator('.lb-row').count()
    if (rows !== 2) throw new Error(`expected 2 players on the leaderboard, saw ${rows}`)
    ok(`leaderboard shows ${rows} players only (audience stays off the board)`)

    console.log('\nSplit-crowd smoke PASSED')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nSplit-crowd smoke FAILED:', e.message)
  process.exit(1)
})
