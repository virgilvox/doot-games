/**
 * Real-browser smoke for Sessions (§4.3) against a running dev server. The host
 * builds a 2-game session (Categories then Would You Rather), a player joins ONCE,
 * plays both games WITHOUT rejoining (the key: presence + the player's plugin
 * follow the swap), the session accumulates a leaderboard, and the final session
 * board shows. Run:
 *   pnpm dev   # in one shell
 *   node scripts/session-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

/** Fill whatever input the current round shows (valid letter answers for Categories
 *  so the player scores; first option for polls; sensible defaults otherwise). */
async function fillInput(host, p) {
  if (await p.locator('.cats-input').count()) {
    const letter = (await host.textContent('.big-letter'))?.trim() ?? 'C'
    const inputs = p.locator('.cats-input')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${letter}word${i}`)
    return
  }
  if (await p.locator('.opt').count()) return p.locator('.opt').first().click()
  if (await p.locator('.rdot').count()) return p.locator('.rdot').last().click()
  if (await p.locator('.answer-input').count()) return p.locator('.answer-input').fill('something')
  if (await p.locator('.survey-input').count()) return p.locator('.survey-input').first().fill('something')
  throw new Error('no recognizable player input on this round')
}

/** Drive one whole game (from its first Open) to its results screen. */
async function playGameToResults(host, p) {
  for (let guard = 0; guard < 20; guard++) {
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')
    await p.waitForSelector('.opt, .rdot, .answer-input, .cats-input, .survey-input', { timeout: 40000 })
    await fillInput(host, p)
    await p.click('button:has-text("Lock it in")')
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
    await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    if (await host.locator('button:has-text("Final results")').count()) {
      await host.click('button:has-text("Final results")')
      return
    }
    await host.click('button:has-text("Next round")')
  }
  throw new Error('game did not reach final results')
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Session: build a 2-game night; a player plays both without rejoining')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/session`)
    await host.waitForSelector('.pick', { timeout: 40000 })
    // Pick Categories (scored, short) then Would You Rather.
    await host.click('.pick:has-text("Categories")')
    await host.click('.pick:has-text("Would You Rather")')
    await host.click('button:has-text("Start session")')
    ok('session built (Categories -> Would You Rather)')

    // The code is in the session bar; a player joins once.
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.locator('input').last().fill('Ana')
    await p.click('button:has-text("Join")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    ok(`player joined room ${code}`)

    // Game 1: Categories.
    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    await host.click('button:has-text("Start game")')
    await playGameToResults(host, p)
    ok('game 1 (Categories) played to results')

    // The session bar offers the next game; the running standings show.
    await host.waitForSelector('.session-bar button:has-text("Next game")', { timeout: 40000 })
    await host.click('.session-bar button:has-text("Next game")')
    ok('advanced to game 2 via the session bar')

    // THE KEY: the player follows the swap without rejoining and can play game 2.
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')
    await p.waitForSelector('.opt', { timeout: 40000 }) // Would You Rather = a poll
    ok('player followed into game 2 (no rejoin) and sees its input')
    // Finish game 2 from where we are (one round already open).
    await fillInput(host, p)
    await p.click('button:has-text("Lock it in")')
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
    for (let guard = 0; guard < 20; guard++) {
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results"), .session-bar', { timeout: 40000 })
      if (await host.locator('.session-bar button:has-text("Finish session")').count()) break
      if (await host.locator('button:has-text("Final results")').count()) { await host.click('button:has-text("Final results")'); continue }
      await host.click('button:has-text("Next round")')
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')
      await p.waitForSelector('.opt', { timeout: 40000 })
      await fillInput(host, p)
      await p.click('button:has-text("Lock it in")')
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')
    }
    await host.click('.session-bar button:has-text("Finish session")')
    ok('game 2 (Would You Rather) played to the session finish')

    // The final session leaderboard shows, with the player who scored in Categories.
    await host.waitForSelector('text=Session champions', { timeout: 40000 })
    await host.waitForSelector('.session-board .sb-name:has-text("Ana")', { timeout: 40000 })
    ok('final session leaderboard shows Ana (scored across the night)')

    console.log('\nPASS: session-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
