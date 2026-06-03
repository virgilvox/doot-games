/**
 * Driver-start smoke: confirms the delegated driver (an MC on their phone) can
 * start the game, for both a generic block game (guess) and the custom-flow
 * Quiz or Die. The host designates the driver in the lobby and NEVER clicks its
 * own start button; the driver's phone does. We then assert the host left the
 * lobby. Run: build or `pnpm dev`, then `node scripts/driver-start-smoke.mjs`.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

async function joinPlayer(ctx, code, name) {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => log(`[${name}] PAGEERROR`, e.message))
  await p.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
  await sleep(800)
  await p.getByLabel(/display name/i).fill(name).catch(() => {})
  await sleep(150)
  await p.getByRole('button', { name: /join game/i }).first().click().catch(() => {})
  await sleep(1500)
  return p
}

async function runOne(browser, { slug, hostUrl, startLabel, leftLobby }) {
  log(`\n=== ${slug} ===`)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } })
  const host = await ctx.newPage()
  const hostErrors = []
  host.on('console', (m) => m.type() === 'error' && hostErrors.push(m.text()))
  host.on('pageerror', (e) => hostErrors.push('PAGEERROR ' + e.message))
  await host.goto(hostUrl, { waitUntil: 'networkidle' })
  await sleep(2500)
  const code = (await host.locator('.code').first().innerText().catch(() => '')).trim()
  log(`room code: "${code}"`)
  if (!code || code.length !== 4) {
    log('FAIL: no room code')
    await ctx.close()
    return false
  }

  const mc = await joinPlayer(ctx, code, 'MC-Mia')
  const p2 = await joinPlayer(ctx, code, 'Rob')
  await sleep(1200)

  // Host designates the first player (Mia) as the driver via the lobby <select>.
  const select = host.locator('select').first()
  const optVal = await host.evaluate(() => {
    const sel = document.querySelector('select')
    const opt = [...(sel?.options ?? [])].find((o) => /mia/i.test(o.textContent || ''))
    return opt ? opt.value : ''
  })
  await select.selectOption(optVal).catch(() => {})
  await sleep(1200)
  log(`designated driver value: "${optVal}"`)

  // The driver's phone must now show a start button; the host must NOT be clicked.
  const driverBtn = mc.getByRole('button', { name: startLabel }).first()
  const driverSees = await driverBtn.count()
  const robSees = await p2.getByRole('button', { name: startLabel }).count()
  log(`driver phone shows start button: ${driverSees > 0}; non-driver shows it: ${robSees > 0}`)
  if (!driverSees) {
    log('FAIL: driver has no start button')
    await ctx.close()
    return false
  }

  await driverBtn.click().catch(() => {})
  await sleep(3000)

  const host_left = await host.evaluate(leftLobby)
  log(`host left lobby after driver start: ${host_left}`)
  log(`host errors: ${hostErrors.length}${hostErrors.length ? ' -> ' + hostErrors.slice(0, 3).join(' | ') : ''}`)
  await ctx.close()
  return host_left && robSees === 0
}

const run = async () => {
  const browser = await chromium.launch()
  const results = {}
  results.guess = await runOne(browser, {
    slug: 'guess (generic block host)',
    hostUrl: `${BASE}/host/guess`,
    startLabel: /start game/i,
    // Generic host leaves the lobby: a prompt/stage is showing.
    leftLobby: () => !document.querySelector('.lobby') && !!document.querySelector('.stage, .prompt'),
  })
  results.qod = await runOne(browser, {
    slug: 'quiz-or-die (custom-flow host)',
    hostUrl: `${BASE}/host/quiz-or-die`,
    startLabel: /enter the house/i,
    // QoD leaves the lobby: the cinematic stage replaces the qod-lobby.
    leftLobby: () => !document.querySelector('.qod-lobby') && !!document.querySelector('.stageMain, .qod-stage, .stage'),
  })
  await browser.close()
  log('\n=== RESULT ===')
  log(`guess driver-start: ${results.guess ? 'PASS' : 'FAIL'}`)
  log(`quiz-or-die driver-start: ${results.qod ? 'PASS' : 'FAIL'}`)
  if (!results.guess || !results.qod) process.exit(1)
}

run().catch((e) => {
  console.error('smoke failed:', e)
  process.exit(1)
})
