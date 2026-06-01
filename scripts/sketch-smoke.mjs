/**
 * Real-browser smoke for Sketch & Spot (the draw -> drawvote two-phase flagship).
 * Drives the actual Pixi draw canvas (pointer drags) and the drawing-gallery vote
 * end to end against a running dev server. Not part of the unit suite.
 *   pnpm dev   # in one shell
 *   node scripts/sketch-smoke.mjs            # or BASE_URL=http://localhost:3100 ...
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)

// Draw a few strokes on the Pixi canvas so the submission has real stroke data.
async function scribble(page, seed) {
  const canvas = page.locator('.draw-canvas canvas')
  await canvas.waitFor({ timeout: 40000 })
  const box = await canvas.boundingBox()
  const x0 = box.x + box.width * 0.2
  const y0 = box.y + box.height * (0.3 + 0.1 * (seed % 3))
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(x0 + (box.width * 0.6 * i) / 6, y0 + Math.sin(i + seed) * box.height * 0.15)
  }
  await page.mouse.up()
}

const browser = await chromium.launch()
let failed = false
try {
  console.log('• Sketch & Spot: 3 players draw + vote through draw -> drawvote')
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  host.on('pageerror', (e) => { console.log('HOST PAGEERROR', e.message); failed = true })
  await host.goto(`${BASE}/host/sketch-spot`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  ok(`host room code = ${code}`)

  const names = ['Ana', 'Ben', 'Cat']
  const players = []
  for (const n of names) {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    p.on('pageerror', (e) => { console.log(`${n} PAGEERROR`, e.message); failed = true })
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.fill('input[placeholder="e.g. Robin"]', n)
    await p.click('button:has-text("Join game")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    players.push(p)
  }
  ok('3 players joined')

  await host.click('button:has-text("Start game")')
  let sawDraw = false
  let sawVote = false
  for (let guard = 0; guard < 12; guard++) {
    await host.waitForSelector('button:has-text("Collect answers"), button:has-text("Open voting")', { timeout: 40000 })
    await host.locator('button:has-text("Collect answers"), button:has-text("Open voting")').first().click()
    await players[0].waitForSelector('.draw-canvas, .dv-player .cell', { timeout: 40000 })
    const isDraw = (await players[0].locator('.draw-canvas').count()) > 0
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (isDraw) {
        await scribble(p, i + guard)
      } else {
        await p.waitForSelector('.dv-player .cell', { timeout: 40000 })
        await p.locator('.dv-player .cell').first().click()
      }
      await p.click('button:has-text("Lock it in")')
    }
    if (isDraw) sawDraw = true
    else sawVote = true
    ok(`round ${guard} (${isDraw ? 'draw' : 'vote'}): all 3 players submitted`)

    await host.waitForSelector('button:has-text("Lock answers"), button:has-text("Lock voting")', { timeout: 40000 })
    await host.locator('button:has-text("Lock answers"), button:has-text("Lock voting")').first().click()
    await host.waitForSelector('button:has-text("Start the vote"), button:has-text("Reveal")', { timeout: 40000 })
    if (await host.locator('button:has-text("Start the vote")').count()) {
      await host.locator('button:has-text("Start the vote")').click()
      continue
    }
    await host.locator('button:has-text("Reveal")').click()
    await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    if (await host.locator('button:has-text("Final results")').count()) {
      await host.click('button:has-text("Final results")')
      break
    }
    await host.click('button:has-text("Next round")')
  }
  if (!sawDraw || !sawVote) throw new Error(`did not see both phases (draw=${sawDraw}, vote=${sawVote})`)
  await host.waitForSelector('text=/wins|results are in/i', { timeout: 40000 })
  ok('two-phase draw loop ran (draw + vote) and reached final results')
} catch (e) {
  console.log(`  ✗ FAILED: ${e.message.split('\n')[0]}`)
  failed = true
} finally {
  await browser.close()
}
console.log(failed ? '\nFAILED' : '\nPASSED: sketch-spot')
process.exit(failed ? 1 : 0)
