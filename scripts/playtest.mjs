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

// Drive any two-phase (make -> judge) flagship: a make round (quip free-text or
// fill blanks) feeds a vote round derived from it. Make rounds label the controls
// "Collect/Lock answers" then "Start the vote →"; judge rounds say "Open/Lock
// voting" then "Reveal". Detects the round kind from the player's input surface.
async function twoPhaseLoop(browser, { gameId, tag }) {
  step(`${gameId}: 3 players write + vote through the two-phase (make -> judge) loop`)
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/${gameId}`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  ok(`host room code = ${code}`)

  const names = ['Ana', 'Ben', 'Cat']
  const players = []
  for (const n of names) {
    const p = await (await browser.newContext()).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.fill('input[placeholder="e.g. Robin"]', n)
    await p.click('button:has-text("Join game")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    players.push(p)
  }
  ok('3 players joined')

  await host.click('button:has-text("Start game")')
  let sawMake = false
  let sawVote = false
  for (let guard = 0; guard < 16; guard++) {
    await host.waitForSelector('button:has-text("Collect answers"), button:has-text("Open voting")', { timeout: 40000 })
    await host.locator('button:has-text("Collect answers"), button:has-text("Open voting")').first().click()
    // Detect the round kind from the first player's input surface.
    await players[0].waitForSelector('.quip-input, .fill-input, .bars-input, .opt', { timeout: 40000 })
    const kind = (await players[0].locator('.quip-input').count())
      ? 'quip'
      : (await players[0].locator('.fill-input').count())
        ? 'fill'
        : (await players[0].locator('.bars-input').count())
          ? 'bars'
          : 'vote'
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      await p.waitForSelector('.quip-input, .fill-input, .bars-input, .opt', { timeout: 40000 })
      if (kind === 'quip') {
        await p.fill('.quip-input', `${names[i]} thinks thing number ${guard}`)
      } else if (kind === 'fill' || kind === 'bars') {
        const fields = p.locator(kind === 'fill' ? '.fill-input' : '.bars-input')
        const count = await fields.count()
        for (let b = 0; b < count; b++) await fields.nth(b).fill(`${kind} line ${i}${b}`)
      } else {
        await p.locator('.opt').first().click()
      }
      await p.click('button:has-text("Lock it in")')
    }
    if (kind === 'vote') sawVote = true
    else sawMake = true
    ok(`round ${guard} (${kind}): all 3 players submitted`)

    await host.waitForSelector('button:has-text("Lock answers"), button:has-text("Lock voting")', { timeout: 40000 })
    await host.locator('button:has-text("Lock answers"), button:has-text("Lock voting")').first().click()
    // A make round goes straight to the vote via "Start the vote →" (reveal+next
    // in one action); a judge round reveals, then advances.
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
  if (!sawMake || !sawVote) throw new Error(`did not see both phases (make=${sawMake}, vote=${sawVote})`)
  await host.waitForSelector('text=/wins|results are in/i', { timeout: 40000 })
  ok('two-phase loop ran (write + vote) and reached final results')
  results.push(tag)
}

const quipClashLoop = (browser) => twoPhaseLoop(browser, { gameId: 'quip-clash', tag: 'quip-clash' })
const fibFinderLoop = (browser) => twoPhaseLoop(browser, { gameId: 'fib-finder', tag: 'fib-finder' })
const circuitCypherLoop = (browser) => twoPhaseLoop(browser, { gameId: 'circuit-cypher', tag: 'circuit-cypher' })

// The gameshow: a single-block buzzer trivia run (open -> answer -> reveal -> next).
async function gameshowLoop(browser) {
  step('What, You Didn\'t Know That?: host + players through a few buzzer questions')
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/what-you-didnt-know`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  ok(`host room code = ${code}`)
  const names = ['Ana', 'Ben']
  const players = []
  for (const n of names) {
    const p = await (await browser.newContext()).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.locator('input').last().fill(n)
    await p.click('button:has-text("Join")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    players.push(p)
  }
  ok('players joined')
  // Lower the question count to keep the playtest quick.
  const three = host.locator('.round-opt:has-text("3")').first()
  if (await three.count()) await three.click()
  await host.click('button:has-text("Start game")')
  let sawBuzzerOpt = false
  for (let guard = 0; guard < 14; guard++) {
    await host.waitForSelector('button:has-text("Open voting"), button:has-text("Collect answers")', { timeout: 40000 })
    await host.locator('button:has-text("Open voting"), button:has-text("Collect answers")').first().click()
    for (const p of players) {
      await p.waitForSelector('.buzzer-opt', { timeout: 40000 })
      sawBuzzerOpt = true
      await p.locator('.buzzer-opt').first().click()
      await p.click('button:has-text("Lock it in")')
    }
    await host.waitForSelector('button:has-text("Lock voting"), button:has-text("Lock answers")', { timeout: 40000 })
    await host.locator('button:has-text("Lock voting"), button:has-text("Lock answers")').first().click()
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
    await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    if (await host.locator('button:has-text("Final results")').count()) {
      await host.click('button:has-text("Final results")')
      break
    }
    await host.click('button:has-text("Next round")')
  }
  if (!sawBuzzerOpt) throw new Error('never saw the buzzer options on a phone')
  await host.waitForSelector('text=/wins|crown|results are in/i', { timeout: 40000 })
  ok('gameshow ran through buzzer questions to final results')
  results.push('gameshow')
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

const allScenarios = [corePlayLoop, quipClashLoop, fibFinderLoop, circuitCypherLoop, gameshowLoop, drawCanvas, authEditorSave]
// Run a subset with ONLY=fibFinderLoop,quipClashLoop (comma-separated fn names).
const only = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean)
const scenarios = only?.length ? allScenarios.filter((s) => only.includes(s.name)) : allScenarios
const browser = await chromium.launch()
try {
  for (const scenario of scenarios) {
    try {
      await scenario(browser)
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message.split('\n')[0]}`)
    }
  }
} finally {
  await browser.close()
}
console.log(`\nPASSED ${results.length}/${scenarios.length} scenarios: ${results.join(', ') || '(none)'}`)
process.exit(results.length === scenarios.length ? 0 : 1)
