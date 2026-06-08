/**
 * Real-browser smoke for P4B on a SCORED judge round (the host toggle "Let the
 * crowd's votes count"). Hosts Quip Clash (quip -> vote), turns the toggle ON, two
 * players make + vote, and a spectator votes on the VOTE round (the new capability:
 * the audience can weigh in on a scored round only when the toggle is on). Asserts the
 * spectator gets a vote surface on the scored round and the final leaderboard contains
 * ONLY the players (the crowd nudges the tally but never joins the board). 0 horizontal
 * overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/crowd-vote-smoke.mjs
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
    step('Crowd toggle ON: a spectator votes on a SCORED vote round, stays off the board')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/quip-clash`)
    await host.waitForSelector('.code', { timeout: 40000 })
    // Keep it short: fewest prompts.
    if (await host.locator('.round-opt').count()) await host.locator('.round-opt').first().click()
    // Turn ON "let the crowd's votes count".
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
    // A spectator "just watches".
    const aud = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await aud.goto(`${BASE}/play/${code}`)
    await aud.waitForSelector('.watch-link', { timeout: 40000 })
    await aud.click('.watch-link')
    await aud.waitForSelector("text=You're watching", { timeout: 40000 })
    ok('2 players joined and a spectator is watching')

    await host.click('button:has-text("Start game")')

    let sawAudienceVoteOnScored = false
    for (let guard = 0; guard < 20; guard++) {
      // A make (quip) round opens with "Collect answers"; a vote round with "Open voting".
      const openBtn = host.locator('button:has-text("Open voting"), button:has-text("Collect answers")').first()
      await openBtn.waitFor({ timeout: 40000 })
      await openBtn.click()

      for (const p of players) {
        await p.page.waitForSelector('.quip-input, .opt', { timeout: 40000 })
        if (await p.page.locator('.quip-input').count()) {
          await p.page.locator('.quip-input').fill(`${p.name} answer ${guard}`)
        } else {
          await p.page.locator('.opt').first().click() // vote for the first answer
        }
        await p.page.click('button:has-text("Lock it in")')
      }

      // Spectator: a crowd-vote surface appears ONLY on the scored vote round (crowd on).
      if (await aud.locator('.aud-opt:not([disabled])').count()) {
        await aud.locator('.aud-opt:not([disabled])').first().click()
        await aud.waitForSelector('text=Your vote is in', { timeout: 40000 })
        await noOverflow(aud, 'spectator vote (390px)')
        sawAudienceVoteOnScored = true
      }

      const lockBtn = host.locator('button:has-text("Lock voting"), button:has-text("Lock answers")').first()
      await lockBtn.waitFor({ timeout: 40000 })
      await lockBtn.click()
      await host.waitForSelector('button:has-text("Start the vote"), button:has-text("Reveal")', { timeout: 40000 })
      if (await host.locator('button:has-text("Start the vote")').count()) {
        await host.click('button:has-text("Start the vote")') // a make round advances to its vote round
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

    if (!sawAudienceVoteOnScored) throw new Error('the spectator never got a vote on a scored round (toggle wiring broken)')
    ok('the spectator voted on a SCORED vote round (only possible with the toggle on)')

    // The final leaderboard has ONLY the two players; the crowd never joins the board.
    await host.waitForSelector('.lb-row', { timeout: 40000 })
    const rows = await host.locator('.lb-row').count()
    if (rows !== 2) throw new Error(`expected 2 players on the leaderboard, saw ${rows}`)
    ok(`leaderboard shows ${rows} players only (audience stays off the board)`)

    console.log('\nCrowd-vote smoke PASSED')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nCrowd-vote smoke FAILED:', e.message)
  process.exit(1)
})
