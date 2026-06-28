/**
 * Host mid-game RESUME smoke. A host reload used to reset a running game back to
 * the lobby (yanking every player to the waiting screen). This verifies the fix:
 * after the host starts a game and reloads, the host RESUMES the same active round
 * (it does not fall back to the lobby) and the player stays in the round.
 *
 * Uses votebox (= [guess, rate]), a resumable game (no runtime-derived answer keys).
 * Run: pnpm dev, then node scripts/host-resume-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}
const pnum = async (page) =>
  ((await page.locator('.stage-controlbar .pnum').first().textContent().catch(() => '')) || '').trim()

const browser = await chromium.launch()
try {
  // Host votebox (a resumable static game).
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code1 = (await host.textContent('.code')).trim()
  console.log(`  host code = ${code1}`)

  // A player joins in the lobby.
  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code1}`)
  await player.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', 'Resume')
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })
  await host.waitForSelector('text=Resume', { timeout: 40000 }) // roster chip
  ok(true, 'player joined the lobby; host roster shows them')

  // Start the game: the host enters the active stage (a round, not the lobby).
  await host.click('button:has-text("Start game")')
  await host.waitForSelector('.stage-controlbar', { timeout: 40000 })
  const roundBefore = await pnum(host)
  ok(/Round 1 \//.test(roundBefore), `host is in the active game (${roundBefore})`)
  await player.waitForSelector('text=/Get ready|Lock it in|Locked in/i', { timeout: 40000 })
  ok(true, 'player left the waiting screen for the active round')

  // RELOAD the host (same context => sessionStorage persists, as on a real reload).
  await host.reload({ waitUntil: 'load' })
  await new Promise((r) => setTimeout(r, 4500)) // connect + resume + roster re-sync

  // THE FIX: the host RESUMES the active game instead of resetting to the lobby.
  const startGone = (await host.locator('button:has-text("Start game")').count()) === 0
  ok(startGone, 'host did NOT fall back to the lobby (no "Start game" button)')
  const barBack = (await host.locator('.stage-controlbar').count()) > 0
  ok(barBack, 'host is back on the active stage after reload')
  const roundAfter = barBack ? await pnum(host) : ''
  ok(roundAfter === roundBefore, `host resumed the same round (${roundBefore} -> ${roundAfter})`)
  ok((await host.textContent('.code')).trim() === code1, 'room code unchanged (players not stranded)')

  // The player was NOT yanked back to the lobby waiting screen.
  const playerWaiting = (await player.locator('text=Waiting for the host to start').count()) > 0
  ok(!playerWaiting, 'player was NOT reset to the lobby waiting screen')
} finally {
  await browser.close()
}
console.log(fails.length ? `\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
