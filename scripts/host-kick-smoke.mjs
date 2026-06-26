/**
 * Host-kick smoke. Two players join; the host kicks one from the lobby roster
 * (confirm dialog accepted); the kicked player drops from the roster. Run: pnpm dev
 * then node scripts/host-kick-smoke.mjs
 */
import { chromium } from 'playwright'
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const fails = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails.push(m) }
const b = await chromium.launch()
try {
  const host = await (await b.newContext()).newPage()
  host.on('dialog', (d) => d.accept()) // accept the kick confirm
  await host.goto(`${BASE}/host/votebox`)
  await host.waitForSelector('.code', { timeout: 40000 })
  const code = (await host.textContent('.code')).trim()
  for (const name of ['Keepme', 'Kickme']) {
    const p = await (await b.newContext()).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.fill('input[placeholder="e.g. Robin"]', name)
    await p.click('button:has-text("Join game")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
  }
  await host.waitForSelector('text=2 joined', { timeout: 40000 })
  ok(true, 'two players joined')
  // Kick "Kickme": click the kick button on that pill.
  const pill = host.locator('.pill', { hasText: 'Kickme' })
  await pill.locator('.kick').click()
  await host.waitForSelector('text=1 joined', { timeout: 40000 })
  const roster = (await host.locator('.pill').allInnerTexts()).join(' ')
  ok(!/Kickme/.test(roster), `kicked player gone from roster (roster: ${JSON.stringify(roster)})`)
  ok(/Keepme/.test(roster), 'the other player remains')
} finally {
  await b.close()
}
console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
