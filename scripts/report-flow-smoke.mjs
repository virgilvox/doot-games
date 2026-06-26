/**
 * Report-flow smoke (moderation 3/3). Drives a VoteBox room to final results, then
 * on the PLAYER phone opens the results report button, picks a reason, and files it.
 * Verifies the POST hits /api/reports (204) and the UI shows the thank-you state.
 * Also files a second report directly and confirms the public endpoint validates
 * (rejects a bad reason, accepts a good one).
 *
 *   pnpm dev   then   node scripts/report-flow-smoke.mjs
 *   BASE_URL=https://doot.games node scripts/report-flow-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}

// 1. The public endpoint validates its body (no browser needed).
const bad = await fetch(`${BASE}/api/reports`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reason: 'because' }),
})
ok(bad.status === 400, `bad reason rejected with 400 (got ${bad.status})`)

const good = await fetch(`${BASE}/api/reports`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reason: 'spam', detail: 'smoke direct report', roomCode: 'TEST', gameTitle: 'Smoke', pluginId: 'votebox' }),
})
ok(good.status === 204, `valid report accepted with 204 (got ${good.status})`)

// 2. The results-screen button files a report end to end.
const b = await chromium.launch()
try {
  const host = await (await b.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  console.log(`  host room code = ${code}`)

  const player = await (await b.newContext()).newPage()
  await player.goto(`${BASE}/play/${code}`)
  await player.waitForSelector('input', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', 'Reporter')
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })

  await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
  await host.click('button:has-text("Start game")')
  await host.waitForSelector('button:has-text("Open voting"), button:has-text("Lock voting")', { timeout: 40000 })
  if (await host.locator('button:has-text("Open voting")').count()) await host.click('button:has-text("Open voting")')

  await player.waitForSelector('.opt', { timeout: 40000 })
  await player.locator('.opt').first().click()
  await player.click('button:has-text("Lock it in")')

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
    if (await host.locator('button:has-text("Open voting")').count()) await host.click('button:has-text("Open voting")')
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
  }

  // Player sees the results screen with the report button.
  await player.waitForSelector('.report-trigger', { timeout: 40000 })
  ok(true, 'report button shows on the player results screen')

  await player.click('.report-trigger')
  await player.waitForSelector('.report-panel', { timeout: 10000 })
  await player.locator('.report-reason', { hasText: 'Hateful or offensive' }).click()
  await player.fill('.report-detail', 'smoke ui report')

  const posted = player.waitForResponse(
    (r) => r.url().endsWith('/api/reports') && r.request().method() === 'POST',
    { timeout: 15000 },
  )
  await player.click('.report-send')
  const res = await posted
  ok(res.status() === 204, `UI report POST returned 204 (got ${res.status()})`)
  await player.waitForSelector('.report-thanks', { timeout: 10000 })
  ok(true, 'thank-you state shown after filing')
} finally {
  await b.close()
}

console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
