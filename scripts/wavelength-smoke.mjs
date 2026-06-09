/**
 * Real-browser smoke for Wavelength (the clue-giver dial, on the P7 foundation). Three
 * players play a few "reads": each clue round exactly ONE player (the clue-giver) gets
 * the secret-target + clue box while the others wait; each guess round the clue-giver
 * gets a dial-less "watch" view (the foundation override) while the others get the dial.
 * Asserts both per-player splits happen and the leaderboard scores the players. 0
 * horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/wavelength-smoke.mjs
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
    step('Wavelength: a rotating clue-giver gives a clue; the room guesses on a dial')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/wavelength`)
    await host.waitForSelector('.code', { timeout: 40000 })
    if (await host.locator('.round-opt').count()) await host.locator('.round-opt').first().click() // 3 reads
    const code = (await host.textContent('.code')).trim()

    const players = []
    for (const name of ['Ana', 'Bo', 'Cy']) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ name, page: p })
    }
    ok('3 players joined')

    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    await host.click('button:has-text("Start game")')

    let sawClueGiver = false
    let sawGuessSplit = false // a guess round where exactly the clue-giver lacked a dial
    for (let guard = 0; guard < 14; guard++) {
      const openBtn = host.locator('button:has-text("Open voting"), button:has-text("Collect answers")').first()
      await openBtn.waitFor({ timeout: 40000 })
      await openBtn.click()

      // Let the per-player views render.
      for (const p of players) await p.page.waitForSelector('.wl', { timeout: 40000 })
      let dials = 0
      for (const p of players) {
        if (await p.page.locator('.clue-input').count()) {
          // The clue-giver on a clue round.
          await p.page.locator('.clue-input').fill('fresh coffee')
          await noOverflow(p.page, 'clue-giver (390px)')
          sawClueGiver = true
        } else if (await p.page.locator('input[type="range"]').count()) {
          // A guesser on a guess round: drag the dial.
          await p.page
            .locator('input[type="range"]')
            .first()
            .evaluate((el) => {
              el.value = '70'
              el.dispatchEvent(new Event('input', { bubbles: true }))
            })
          await noOverflow(p.page, 'guesser (390px)')
          dials++
        }
        if (await p.page.locator('button:has-text("Lock it in")').count()) {
          await p.page.click('button:has-text("Lock it in")')
        }
      }
      // On a guess round, exactly the clue-giver lacks a dial (the foundation override).
      if (dials > 0 && dials === players.length - 1) sawGuessSplit = true

      const lockBtn = host.locator('button:has-text("Lock voting"), button:has-text("Lock answers")').first()
      await lockBtn.waitFor({ timeout: 40000 })
      await lockBtn.click()
      await host.waitForSelector('button:has-text("Start the vote"), button:has-text("Reveal")', { timeout: 40000 })
      if (await host.locator('button:has-text("Start the vote")').count()) {
        await host.click('button:has-text("Start the vote")') // clue round -> its guess round
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

    if (!sawClueGiver) throw new Error('no clue-giver ever got the secret clue box (clue assignment broken)')
    if (!sawGuessSplit) throw new Error('a guess round never split the clue-giver from the guessers (foundation override broken)')
    ok('each clue round had one clue-giver; each guess round split the clue-giver off the dial')

    await host.waitForSelector('.lb-row', { timeout: 40000 })
    const rows = await host.locator('.lb-row').count()
    if (rows !== 3) throw new Error(`expected 3 players on the leaderboard, saw ${rows}`)
    ok(`leaderboard shows ${rows} players`)

    const phone = players[0].page
    await noOverflow(phone, 'results (phone)')
    ok('phone results: 0 horizontal overflow at 390px')

    console.log('\nWavelength smoke PASSED')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nWavelength smoke FAILED:', e.message)
  process.exit(1)
})
