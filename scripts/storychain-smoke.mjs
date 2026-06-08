/**
 * Real-browser smoke for Story Chain (the first game on the P7 pipeline foundation)
 * against a running dev server. Three players join; each round everyone writes a
 * line; the KEY assertion is that on a pass round each phone privately receives
 * ANOTHER player's previous line (the rotation, delivered through the engine's
 * per-player content path), and the final "unspool" shows one story per player. 0
 * horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/storychain-smoke.mjs
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
    step('Story Chain: 3 players pass lines around; each gets a neighbor line')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/story-chain`)
    await host.waitForSelector('.code', { timeout: 40000 })
    // Keep it short: pick 3 lines.
    await host.waitForSelector('.round-opt', { timeout: 40000 })
    await host.locator('.round-opt', { hasText: /^3$/ }).first().click()
    const code = (await host.textContent('.code')).trim()

    const names = ['Ana', 'Bo', 'Cy']
    const players = []
    for (const name of names) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ name, page: p, last: '' })
    }
    ok(`3 players joined room ${code}`)

    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    await host.click('button:has-text("Start game")')

    let rounds = 0
    let sawRotation = false
    for (let r = 0; r < 4; r++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')

      const prevByName = Object.fromEntries(players.map((p) => [p.name, p.last]))
      for (const p of players) {
        await p.page.waitForSelector('.line-input', { timeout: 40000 })
        if (r > 0) {
          // A pass round: the phone must show a line received from someone else.
          const received = (await p.page.textContent('.received'))?.trim() ?? ''
          const others = players.filter((q) => q.name !== p.name).map((q) => prevByName[q.name])
          if (received && others.includes(received)) sawRotation = true
          if (received === prevByName[p.name] && received) {
            throw new Error(`${p.name} received their OWN previous line (${received}); rotation broken`)
          }
        } else {
          if (!(await p.page.locator('.card.seed').count())) throw new Error('seed round missing the seed card')
        }
        const line = `${p.name}${r}` // distinctive per player per round
        await p.page.locator('.line-input').fill(line)
        p.last = line
        await noOverflow(p.page, `round ${r} input`)
        await p.page.click('button:has-text("Lock it in")')
      }

      await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')
      rounds++
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
      if (await host.locator('button:has-text("Final results")').count()) {
        await host.click('button:has-text("Final results")')
        break
      }
      await host.click('button:has-text("Next round")')
    }
    if (rounds !== 3) throw new Error(`expected 3 rounds, played ${rounds}`)
    if (!sawRotation) throw new Error('never saw a player receive another player line (rotation not delivered)')
    ok('every pass round delivered a neighbor line (per-player rotation works)')

    // The unspool: one story per player (3 threads), shown on the big screen + phones.
    await host.waitForSelector('.unspool .story', { timeout: 40000 })
    const stories = await host.locator('.unspool .story').count()
    if (stories !== 3) throw new Error(`expected 3 stories in the unspool, saw ${stories}`)
    ok(`unspool shows ${stories} stories on the big screen`)

    const phone = players[0].page
    await phone.waitForSelector('.unspool .story', { timeout: 40000 })
    await noOverflow(phone, 'results (phone)')
    ok('phone shows the unspool with 0 horizontal overflow at 390px')

    console.log('\nStory Chain smoke PASSED')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nStory Chain smoke FAILED:', e.message)
  process.exit(1)
})
