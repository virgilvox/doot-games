/**
 * Player-name moderation smoke. Player names are public (projected on the big
 * screen), so the host masks strong profanity/slurs in them. This joins a room with
 * a flagged name and asserts the HOST roster shows it masked (the mask char, not the
 * raw word) while a player is present. Run: pnpm dev then node scripts/name-filter-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const RAW = 'fuckwit' // a clearly-flagged name (obscenity 'moderate')
const fails = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails.push(m) }

const browser = await chromium.launch()
try {
  const host = await (await browser.newContext()).newPage()
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()

  const player = await (await browser.newContext()).newPage()
  await player.goto(`${BASE}/play/${code}`)
  await player.waitForSelector('input', { timeout: 40000 })
  await player.fill('input[placeholder="e.g. Robin"]', RAW)
  await player.click('button:has-text("Join game")')
  await player.waitForSelector('text=You are in', { timeout: 40000 })
  await host.waitForSelector('text=1 player', { timeout: 40000 })
  ok(true, 'player joined with a flagged name')

  // The host roster pill should show the MASKED name, never the raw profanity.
  const roster = (await host.locator('.pill').allInnerTexts()).join(' ')
  ok(!/fuck/i.test(roster), `host roster does NOT show the raw profanity (roster: ${JSON.stringify(roster)})`)
  ok(/•/.test(roster), 'host roster shows the masked name (mask char present)')
} finally {
  await browser.close()
}
console.log(fails.length ? `\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
