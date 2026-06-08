/**
 * Real-browser smoke for Doodle Chain (Gartic Phone) against a running dev server.
 * Three players play a 4-round chain: write a prompt, draw the prompt you got,
 * describe the drawing you got, draw again. The KEY assertions: a DRAW round mounts
 * the Pixi canvas and a real stroke submits; a DESCRIBE round privately shows the
 * player a DRAWING someone else made (the per-player rotation, drawings and all);
 * and the final unspool is a gallery of 3 chains mixing text and drawings, with 0
 * horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/doodlechain-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

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

async function run() {
  const browser = await chromium.launch()
  try {
    step('Doodle Chain: 3 players draw + describe down the chain')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/doodle-chain`)
    await host.waitForSelector('.code', { timeout: 40000 })
    await host.waitForSelector('.round-opt', { timeout: 40000 })
    await host.locator('.round-opt', { hasText: /^2$/ }).first().click() // 2 drawings = 5 rounds
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
      players.push({ name, page: p })
    }
    ok(`3 players joined room ${code}`)

    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    await host.click('button:has-text("Start game")')

    let rounds = 0
    let sawDrawRound = false
    let sawReceivedDrawing = false
    for (let r = 0; r < 7; r++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')

      for (let i = 0; i < players.length; i++) {
        const p = players[i].page
        // Wait for whichever input this round shows.
        await p.waitForSelector('.draw-canvas, .line-input', { timeout: 40000 })
        const isDraw = (await p.locator('.draw-canvas').count()) > 0
        if (isDraw) {
          sawDrawRound = true
          await scribble(p, i + r)
          await noOverflow(p, `draw round ${r}`)
        } else {
          // A describe round (not the seed) must privately show a received drawing.
          if (r > 0 && (await p.locator('.card.pass .draw-thumb').count()) > 0) sawReceivedDrawing = true
          await p.locator('.line-input').fill(`${players[i].name}-r${r}`)
          await noOverflow(p, `text round ${r}`)
        }
        await p.click('button:has-text("Lock it in")')
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
    if (rounds !== 5) throw new Error(`expected 5 rounds (2 drawings), played ${rounds}`)
    if (!sawDrawRound) throw new Error('never hit a draw round (canvas missing)')
    if (!sawReceivedDrawing) throw new Error('a describe round never showed a received drawing (rotation of drawings failed)')
    ok('draw rounds submitted strokes; describe rounds received a neighbor drawing')

    // The unspool: 3 chains, mixing text steps and drawing thumbnails.
    await host.waitForSelector('.unspool .chain', { timeout: 40000 })
    const chains = await host.locator('.unspool .chain').count()
    const thumbs = await host.locator('.unspool .draw-thumb').count()
    if (chains !== 3) throw new Error(`expected 3 chains in the unspool, saw ${chains}`)
    if (thumbs < 1) throw new Error('the unspool gallery has no drawings')
    ok(`unspool shows ${chains} chains with ${thumbs} drawings on the big screen`)

    const phone = players[0].page
    await phone.waitForSelector('.unspool .chain', { timeout: 40000 })
    await noOverflow(phone, 'results (phone)')
    ok('phone shows the gallery unspool with 0 horizontal overflow at 390px')

    console.log('\nDoodle Chain smoke PASSED')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nDoodle Chain smoke FAILED:', e.message)
  process.exit(1)
})
