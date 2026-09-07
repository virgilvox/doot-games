/**
 * A round must NOT close itself because someone's phone went quiet.
 *
 * Auto-advance used to compare "who has answered" against a count derived from
 * presence, so a phone whose screen locked dropped off the roster, shrank the
 * denominator, and closed the round on its owner while they were still reading
 * the question off the big screen. This drives the real shape: three phones, two
 * answer, the third stops beating, and the round has to stay open.
 *
 *   pnpm dev   then   node scripts/autolock-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
const fails = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fails.push(m) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await chromium.launch()
try {
  const host = await b.newPage()
  await host.goto(`${BASE}/host/votebox`, { waitUntil: 'domcontentloaded' })
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.locator('.code').first().textContent()).trim()
  console.log(`room ${code}`)

  const join = async (name) => {
    const p = await b.newPage()
    await p.goto(`${BASE}/play/${code}`, { waitUntil: 'domcontentloaded' })
    await p.fill('input[placeholder="e.g. Robin"]', name)
    await p.click('button[type="submit"], button:has-text("Join")')
    await p.waitForSelector('text=/You are in|Waiting for the host/i', { timeout: 60000 })
    return p
  }
  // Timers OFF, which is the configuration this bug actually bites in: with a
  // timer running, the engine closes the round on the deadline and auto-advance
  // never gets to be wrong. Open "Adjust for tonight" first if it is collapsed.
  const adjust = host.locator('summary:has-text("Adjust for tonight"), details:has-text("Adjust for tonight") summary')
  if (await adjust.count()) await adjust.first().click().catch(() => {})
  const timersBox = host.locator('label:has-text("Turn off round timers") input[type=checkbox]')
  await timersBox.first().waitFor({ timeout: 20000 })
  await timersBox.first().check()
  await host.waitForTimeout(1200)

  const p1 = await join('Ann')
  const p2 = await join('Bo')
  const sleeper = await join('Sleeper')
  await host.waitForTimeout(2500)

  await host.click('button:has-text("Start game")')
  await host.waitForSelector('.stage-controlbar', { timeout: 40000 })
  const open = host.locator('button:has-text("Open voting"), button:has-text("Open answers")')
  if (await open.count()) await open.first().click()
  await sleep(2500)

  const answer = async (p) => {
    const opt = p.locator('.opt, button[class*=opt]').first()
    await opt.click({ timeout: 30000 })
    const lock = p.locator('button:has-text("Lock it in")')
    if (await lock.count()) await lock.first().click()
    await p.waitForSelector('text=/Locked in/i', { timeout: 30000 })
  }
  await answer(p1)
  await answer(p2)
  ok(true, 'two of three answered')

  // The third phone goes quiet: screen locked, tab suspended, heartbeat stops.
  await sleeper.close()
  console.log('  third phone stopped beating; waiting past the presence window...')
  await sleep(32000)

  const label = await host.locator('.stage-controlbar').innerText()
  ok(/Answers open|Voting open/i.test(label),
     `round STAYED OPEN after the quiet phone aged off the roster -> "${label.replace(/\s+/g, ' ').slice(0, 80)}"`)

  // And the host can still end it by hand, so a genuine departure is not a stall.
  const lockBtn = host.locator('button:has-text("Lock")')
  if (await lockBtn.count()) {
    await lockBtn.first().click()
    await sleep(1500)
    const after = await host.locator('.stage-controlbar').innerText()
    ok(/Answers in|Voting closed/i.test(after), 'the host can still close it manually (a real departure is not a stall)')
  } else {
    ok(false, 'no manual Lock control on the host')
  }
} finally {
  await b.close()
}
console.log(fails.length ? `\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}` : '\nALL GREEN')
process.exit(fails.length ? 1 : 0)
