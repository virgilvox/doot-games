/**
 * Room-lifecycle smoke: the three "start fresh" paths after the resume change.
 *   A. New room (lobby)  -> brand-new code, roster cleared (a new group joins).
 *   B. Play again (end)  -> SAME code, same crowd kept, back to round 1 (scores reset).
 *   C. End game (active) -> confirm -> brand-new code, back to lobby (bail a false start).
 * Refresh-resumes is covered by host-resume-smoke; this covers the explicit actions.
 * Run: pnpm dev, then node scripts/host-lifecycle-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}
const codeOf = async (page) => (await page.textContent('.code')).trim()

// Host a fresh votebox room (own browser context => own sessionStorage/code).
async function hostRoom(browser) {
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  return host
}
async function joinPlayer(browser, code, name) {
  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code}`)
  await player.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', name)
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })
  return player
}
// Drive the host from the lobby all the way to final results (reused from the core loop).
async function driveToResults(host, player) {
  await host.click('button:has-text("Start game")')
  const openIfNeeded = async () => {
    await host.waitForSelector('button:has-text("Open voting"), button:has-text("Lock voting")', { timeout: 40000 })
    if (await host.locator('button:has-text("Open voting")').count()) await host.click('button:has-text("Open voting")')
  }
  await openIfNeeded()
  if (await player.locator('.opt').count()) {
    await player.locator('.opt').first().click()
    if (await player.locator('button:has-text("Lock it in")').count()) await player.click('button:has-text("Lock it in")')
  }
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
    await openIfNeeded()
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')
  }
  await host.waitForSelector('button:has-text("Play again")', { timeout: 40000 })
}

const browser = await chromium.launch()
try {
  // --- A. New room in the lobby: fresh code, roster cleared ---
  console.log('A. New room (lobby)')
  {
    const host = await hostRoom(browser)
    const code1 = await codeOf(host)
    await joinPlayer(browser, code1, 'LobbyA')
    await host.waitForSelector('text=LobbyA', { timeout: 40000 })
    await host.click('button:has-text("New room")')
    await host.waitForSelector('.code', { timeout: 40000 })
    await host.waitForFunction((old) => document.querySelector('.code')?.textContent?.trim() !== old, code1, { timeout: 40000 })
    const code2 = await codeOf(host)
    ok(code2 !== code1, `New room minted a fresh code (${code1} -> ${code2})`)
    ok((await host.locator('text=LobbyA').count()) === 0, 'roster cleared (old player gone)')
    ok((await host.locator('button:has-text("Start game")').count()) > 0, 'back in a fresh lobby')
  }

  // --- B. Play again at results: same code, crowd kept, back to round 1 ---
  console.log('B. Play again (results)')
  {
    const host = await hostRoom(browser)
    const code = await codeOf(host)
    const player = await joinPlayer(browser, code, 'AgainB')
    await driveToResults(host, player)
    await host.click('button:has-text("Play again")')
    await host.waitForSelector('.stage-controlbar', { timeout: 40000 })
    const round = ((await host.locator('.stage-controlbar .pnum').first().textContent()) || '').trim()
    ok(/Round 1 \//.test(round), `Play again restarted at round 1 (${round})`)
    ok((await codeOf(host)) === code, 'Play again kept the SAME code (no re-scan)')
    // The player was carried into the new game, not bounced to the join screen.
    await player.waitForSelector('text=/Get ready|Lock it in|Locked in|.opt/i', { timeout: 40000 })
    ok((await player.locator('input[placeholder="e.g. Robin"]').count()) === 0, 'player kept in the room (no re-join)')
  }

  // --- C. End game mid-round: confirm, fresh code, back to lobby ---
  console.log('C. End game (active)')
  {
    const host = await hostRoom(browser)
    const code = await codeOf(host)
    const player = await joinPlayer(browser, code, 'EndC')
    await host.click('button:has-text("Start game")')
    await host.waitForSelector('.stage-controlbar', { timeout: 40000 })
    await host.waitForSelector('button:has-text("End game")', { timeout: 40000 })
    host.on('dialog', (d) => d.accept()) // accept the confirm
    await host.click('button:has-text("End game")')
    await host.waitForSelector('.code', { timeout: 40000 })
    await host.waitForFunction((old) => document.querySelector('.code')?.textContent?.trim() !== old, code, { timeout: 40000 })
    ok((await codeOf(host)) !== code, 'End game minted a fresh code')
    ok((await host.locator('button:has-text("Start game")').count()) > 0, 'End game returned to a fresh lobby')
    void player
  }
} finally {
  await browser.close()
}
console.log(fails.length ? `\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
