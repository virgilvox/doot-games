/**
 * Post-deploy core-loop smoke. Drives the REAL gameplay loop (host + player, over
 * the live CLASP relay) end to end against a running site: host a VoteBox room, a
 * player joins, answers, the host advances to final results, both surfaces show
 * results. Wired into CI as a job that runs AFTER deploy against prod, so a deploy
 * that breaks gameplay turns the run red even though static tests passed.
 *
 * Timing-robust by design: it never depends on countdown timers (headless throttles
 * background-tab timers), only on host-driven advancement + relay state, with
 * generous waits. Retries the whole loop to absorb transient relay/network flake
 * while a real break (which fails every attempt) still fails the job.
 *
 *   BASE_URL=https://doot.games node scripts/smoke-coreloop.mjs
 *   (defaults to http://localhost:3000; SMOKE_ATTEMPTS overrides the retry count)
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS) || 2
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Wait for the site to answer /api/health (a fresh deploy needs a moment to roll). */
async function waitForHealth(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await sleep(3000)
  }
  throw new Error(`site never became healthy at ${BASE}/api/health`)
}

async function coreLoop(browser) {
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  if (!/^[A-Z2-9]{4}$/.test(code)) throw new Error(`bad room code: ${JSON.stringify(code)}`)
  console.log(`  host room code = ${code}`)

  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code}`)
  await player.waitForSelector('input', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', 'Smoke')
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })

  await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
  await host.click('button:has-text("Start game")')
  // Untimed rounds auto-open (no "Open voting" click); timed rounds show the button.
  await host.waitForSelector('button:has-text("Open voting"), button:has-text("Lock voting")', { timeout: 40000 })
  if (await host.locator('button:has-text("Open voting")').count()) {
    await host.click('button:has-text("Open voting")')
  }

  await player.waitForSelector('.opt', { timeout: 40000 })
  await player.locator('.opt').first().click()
  await player.click('button:has-text("Lock it in")')
  await player.waitForSelector('text=Locked in', { timeout: 40000 })

  await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
  await host.click('button:has-text("Lock voting")')
  await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
  await host.click('button:has-text("Reveal")')

  for (let guard = 0; guard < 20; guard++) {
    await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    if (await host.locator('button:has-text("Final results")').count()) {
      await host.click('button:has-text("Final results")')
      break
    }
    await host.click('button:has-text("Next round")')
    await host.waitForSelector('button:has-text("Open voting"), button:has-text("Lock voting")', { timeout: 40000 })
    if (await host.locator('button:has-text("Open voting")').count()) {
      await host.click('button:has-text("Open voting")')
    }
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
  }

  await host.waitForSelector('text=/wins|results are in|Gallery|results/i', { timeout: 40000 })
  await player.waitForSelector('text=/results|wins|Answers are up/i', { timeout: 40000 })
  console.log('  results rendered on host and player')
}

console.log(`Core-loop smoke against ${BASE} (${ATTEMPTS} attempt(s))`)
await waitForHealth()

let passed = false
let lastErr
for (let attempt = 1; attempt <= ATTEMPTS && !passed; attempt++) {
  const browser = await chromium.launch()
  try {
    await coreLoop(browser)
    passed = true
    console.log(`\nPASS (attempt ${attempt})`)
  } catch (e) {
    lastErr = e
    console.log(`  attempt ${attempt} failed: ${String(e.message).split('\n')[0]}`)
    if (attempt < ATTEMPTS) await sleep(5000)
  } finally {
    await browser.close()
  }
}

if (!passed) {
  console.log(`\nFAIL after ${ATTEMPTS} attempt(s): ${lastErr?.message?.split('\n')[0]}`)
  process.exit(1)
}
