/**
 * Real-browser smoke for the quick-win games (Would You Rather, Tier List,
 * Over/Under) against a running dev server. Each hosts, a player joins and plays a
 * round, and the game reaches a reveal, so a composition or rendering break shows
 * up that unit tests can't catch. 0 horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/quickwins-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

/** Host a game, join one player, play one round through a reveal. `pick` taps the
 *  player's input for this block. */
async function playOne(browser, gameId, pick) {
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/${gameId}`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()

  const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
  await p.goto(`${BASE}/play/${code}`)
  await p.waitForSelector('input', { timeout: 40000 })
  await p.locator('input').last().fill('Ana')
  await p.click('button:has-text("Join")')
  await p.waitForSelector('text=You are in', { timeout: 40000 })

  await host.click('button:has-text("Start game")')
  await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
  await host.click('button:has-text("Open voting")')

  await p.waitForSelector('.prompt', { timeout: 40000 })
  await noOverflow(p, `${gameId} round`)
  await pick(p)
  await p.click('button:has-text("Lock it in")')
  await p.waitForSelector('text=Locked in', { timeout: 40000 })

  await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
  await host.click('button:has-text("Lock voting")')
  await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
  await host.click('button:has-text("Reveal")')
  await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
  await noOverflow(p, `${gameId} reveal`)
  ok(`${gameId}: hosted, joined, played a round to reveal`)
  await host.close()
  await p.close()
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Quick-win games: each hosts and plays a round')
    // Would You Rather + Over/Under use option buttons (.opt); Tier List uses the
    // rating dots (.rdot).
    await playOne(browser, 'would-you-rather', async (p) => {
      await p.waitForSelector('.opt', { timeout: 40000 })
      await p.locator('.opt').first().click()
    })
    await playOne(browser, 'over-under', async (p) => {
      await p.waitForSelector('.opt', { timeout: 40000 })
      await p.locator('.opt').first().click()
    })
    await playOne(browser, 'tier-list', async (p) => {
      await p.waitForSelector('.rdot', { timeout: 40000 })
      await p.locator('.rdot').last().click() // top tier (S)
    })
    console.log('\nPASS: quickwins-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
