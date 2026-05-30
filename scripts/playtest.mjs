/**
 * Real-browser playtest (Playwright + Chromium) against a running dev server.
 * Drives the Vue UI + relay end-to-end: the core play loop (VoteBox), the Pixi
 * Draw canvas, and the auth → editor → save flow. Not part of the test suite
 * (needs a browser + the dev server); run manually:
 *   pnpm dev   # in one shell
 *   node scripts/playtest.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const results = []
const ok = (m) => { console.log(`  ✓ ${m}`); }
const step = (m) => console.log(`• ${m}`)

async function corePlayLoop(browser) {
  step('Core play loop (VoteBox): host + player through a round to results')
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  if (!/^[A-Z2-9]{4}$/.test(code)) throw new Error(`bad room code: ${JSON.stringify(code)}`)
  ok(`host room code = ${code}`)

  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code}`)
  await player.waitForSelector('input', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', 'Alice')
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })
  ok('player joined the lobby')

  await host.waitForSelector('button:has-text("Start game")')
  await host.click('button:has-text("Start game")')
  await host.click('button:has-text("Open voting")', { timeout: 40000 })
  ok('host started the game and opened voting')

  await player.waitForSelector('.opt', { timeout: 40000 })
  await player.locator('.opt').first().click()
  await player.click('button:has-text("Lock it in")')
  await player.waitForSelector('text=Locked in', { timeout: 40000 })
  ok('player picked an option and locked it in')

  // Host should see the submission (roster shows 1 player).
  await host.waitForSelector('text=1 player', { timeout: 40000 })
  ok('host roster shows the player')

  await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
  await host.click('button:has-text("Lock voting")')
  await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
  await host.click('button:has-text("Reveal")')
  ok('host locked and revealed round 1')

  // Drive the remaining rounds generically (VoteBox alternates guess/rate over
  // several subjects) until "Final results" appears.
  for (let guard = 0; guard < 20; guard++) {
    await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    if (await host.locator('button:has-text("Final results")').count()) {
      await host.click('button:has-text("Final results")')
      break
    }
    await host.click('button:has-text("Next round")')
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
  }
  ok('host advanced through all rounds to final results')

  // Both surfaces should show results.
  await host.waitForSelector('text=/wins|results are in|Gallery|results/i', { timeout: 40000 })
  await player.waitForSelector('text=/results|wins|Answers are up/i', { timeout: 40000 })
  ok('results rendered on host and player')
  results.push('core-play-loop')
}

async function drawCanvas(browser) {
  step('Draw block: player sketches on the Pixi canvas, host gallery fills in')
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/draw`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code}`)
  await player.waitForSelector('input', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', 'Sketch')
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })
  await host.click('button:has-text("Start game")')
  await host.click('button:has-text("Open voting")', { timeout: 40000 })

  const canvas = player.locator('.draw-canvas canvas')
  await canvas.waitFor({ timeout: 40000 })
  ok('Pixi draw canvas mounted on the player')
  const box = await canvas.boundingBox()
  // Draw a little zig-zag stroke.
  await player.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
  await player.mouse.down()
  for (const [fx, fy] of [[0.4, 0.6], [0.6, 0.3], [0.8, 0.6]]) {
    await player.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 5 })
  }
  await player.mouse.up()
  await player.click('button:has-text("Lock it in")')
  ok('player drew a stroke and locked it in')

  await host.waitForSelector('.draw-thumb', { timeout: 40000 })
  ok('host gallery shows the drawing (SVG thumbnail)')
  results.push('draw-canvas')
}

async function authEditorSave(browser) {
  step('Auth → editor → save: register, author a Poll, save a shareable link')
  const page = await (await browser.newContext()).newPage()
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[type="email"]', { timeout: 40000 })
  const email = `pt_${Date.now().toString(36)}@example.com`
  // Switch to register mode first, then fill, then submit.
  await page.click('button:has-text("Create an account")')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'hunter2pass')
  await page.click('button[type="submit"]:has-text("Create account")')
  await page.waitForURL('**/explore', { timeout: 40000 })
  ok(`registered + signed in as ${email}`)

  await page.goto(`${BASE}/editor/poll`)
  await page.waitForSelector('text=Host now', { timeout: 40000 })
  await page.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 40000 })
  await page.waitForSelector('text=/\\/g\\//', { timeout: 40000 })
  const link = await page.textContent('.ed-saved-link')
  if (!/\/g\/g_/.test(link)) throw new Error(`unexpected share link: ${link}`)
  ok(`saved → shareable link ${link.trim()}`)
  results.push('auth-editor-save')
}

const browser = await chromium.launch()
try {
  for (const scenario of [corePlayLoop, drawCanvas, authEditorSave]) {
    try {
      await scenario(browser)
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message.split('\n')[0]}`)
    }
  }
} finally {
  await browser.close()
}
console.log(`\nPASSED ${results.length}/3 scenarios: ${results.join(', ') || '(none)'}`)
process.exit(results.length === 3 ? 0 : 1)
