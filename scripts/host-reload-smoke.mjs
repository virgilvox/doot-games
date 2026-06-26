/**
 * Host-reload survival smoke. A host reload used to regenerate the room code and
 * strand every player; this verifies the fix: after the host reloads, the join code
 * is UNCHANGED and a player who joined before the reload is still in the host's
 * roster (the room survived). Run: pnpm dev then node scripts/host-reload-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const fails = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails.push(m) }

const browser = await chromium.launch()
try {
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code1 = (await host.textContent('.code')).trim()
  console.log(`  host code before reload = ${code1}`)

  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code1}`)
  await player.waitForSelector('input', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', 'Reload')
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })
  await host.waitForSelector('text=1 player', { timeout: 40000 })
  ok(true, 'player joined; host roster shows them')

  // Reload the HOST tab (same context => sessionStorage survives, as on a real reload).
  await host.reload({ waitUntil: 'load' })
  await host.waitForSelector('.code', { timeout: 40000 })
  await new Promise((r) => setTimeout(r, 3500)) // let connect + heartbeat + roster re-sync
  const code2 = (await host.textContent('.code')).trim()
  ok(code1 === code2, `host code is UNCHANGED after reload (${code1} -> ${code2})`)

  // The room survived: the pre-reload player is still in the host's roster.
  const rosterHasPlayer = (await host.locator('text=1 player').count()) > 0 || (await host.locator('text=Reload').count()) > 0
  ok(rosterHasPlayer, 'pre-reload player is still in the host roster (room survived)')

  // The player isn't stranded: still connected (no permanent "host went away" dead end).
  const playerLive = (await player.locator('text=/You are in|Locked in|results/i').count()) > 0
  ok(playerLive, 'player is still in the room (not stranded on a dead code)')
} finally {
  await browser.close()
}
console.log(fails.length ? `\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
