/**
 * Real-browser smoke for Categories (Scattergories) against a running dev server.
 * Two players read the round's letter, type valid + unique answers, the host
 * reveals the scored breakdown, and the game reaches a leaderboard. 0 horizontal
 * overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/categories-smoke.mjs
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
    step('Categories: two players type valid+unique answers; the host scores them')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/categories`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    const players = []
    for (const name of ['Ana', 'Ben']) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ page: p, name })
    }
    ok('2 players joined')

    await host.click('button:has-text("Start game")')
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')

    // The round's letter is on the big screen.
    await host.waitForSelector('.big-letter', { timeout: 40000 })
    const letter = (await host.textContent('.big-letter'))?.trim() ?? 'C'
    ok(`round letter = ${letter}`)

    // Each player fills every category with a distinct, valid (letter-starting) answer.
    const suffix = { Ana: 'lphaword', Ben: 'ravoword' }
    for (const { page: p, name } of players) {
      await p.waitForSelector('.cats-input', { timeout: 40000 })
      const inputs = p.locator('.cats-input')
      const n = await inputs.count()
      for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${letter}${suffix[name]}${i}`)
      await noOverflow(p, `${name} input`)
      await p.click('button:has-text("Lock it in")')
      await p.waitForSelector('text=Locked in', { timeout: 40000 })
    }
    ok('both players filled valid + unique answers and locked in')

    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')

    // The host reveal grid shows scored answers.
    await host.waitForSelector('.reveal-grid .ans li.scored', { timeout: 40000 })
    ok('host reveal shows scored answers')
    // The player reveal shows their score (all unique + valid -> > 0).
    const score = (await players[0].page.textContent('.cats-reveal h2')) ?? ''
    if (!/You scored [1-9]/.test(score)) throw new Error(`expected a positive score, got: ${score}`)
    await noOverflow(players[0].page, 'player reveal')
    ok(`player reveal: "${score.trim()}"`)

    // Advance through the remaining rounds to the leaderboard.
    for (let guard = 0; guard < 8; guard++) {
      const fin = host.locator('button:has-text("Final results")')
      if (await fin.count()) {
        await fin.click()
        break
      }
      await host.click('button:has-text("Next round")')
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')
      const l = (await host.textContent('.big-letter'))?.trim() ?? 'C'
      for (const { page: p, name } of players) {
        await p.waitForSelector('.cats-input', { timeout: 40000 })
        const inputs = p.locator('.cats-input')
        const n = await inputs.count()
        for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${l}${suffix[name]}${i}`)
        await p.click('button:has-text("Lock it in")')
      }
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    }
    await host.waitForSelector('.rhead h1', { timeout: 40000 })
    const headline = (await host.textContent('.rhead h1'))?.trim() ?? ''
    if (!headline) throw new Error('results headline is empty')
    ok(`reached the final results: "${headline}"`)

    console.log('\nPASS: categories-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
