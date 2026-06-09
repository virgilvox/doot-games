/**
 * Real-browser smoke of Bingo (the custom flow). Drives a host + 3 phones through:
 * start -> each phone gets a DISTINCT auto-marking card -> the host calls items off the
 * big screen -> a phone RELOADS mid-game and its marks come back (reconnect-safe) -> the
 * first to a line claims, the host VERIFIES it and crowns a winner -> end -> results.
 * Asserts distinct cards, reconnect keeps marks, and zero horizontal overflow at 390px
 * (phone) and 1440px (host). Run:  pnpm dev  then  node scripts/bingo-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text()
      if (/favicon|autoplay|not allowed to start|AudioContext|Better Auth|baseURL/i.test(t)) return
      errors.push(`[${who} console] ${t}`)
    }
  })
  page.on('pageerror', (e) => errors.push(`[${who} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`))
}

const NAMES = ['Ada', 'Boo', 'Cal']

async function joinForm(page, name) {
  await page.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await page.fill('input[placeholder="e.g. Robin"]', name)
  await page.click('button:has-text("Join game")')
  // Reconnecting under the same name triggers the "that name is in this room" warning;
  // confirm "That's me, reconnect" so the player rejoins (the real, correct flow).
  const recon = page.locator('button:has-text("reconnect")')
  try { await recon.waitFor({ state: 'visible', timeout: 2500 }); await recon.click() } catch { /* fresh join, no warning */ }
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) errors.push(`${label}: horizontal overflow of ${overflow}px`)
  else ok(`${label}: no horizontal overflow`)
}

async function callNext(host) {
  const b = host.locator('button:has-text("Call the")')
  if (await b.count()) await b.first().click().catch(() => {})
  await host.waitForTimeout(120)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Host opens Bingo')
    const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    watch(host, 'host')
    await host.goto(`${BASE}/host/bingo`)
    await host.waitForSelector('.code', { timeout: 60000 })
    const code = (await host.textContent('.code')).trim()
    ok(`room code = ${code}`)

    step('3 phones join (390px viewport)')
    const players = []
    for (const name of NAMES) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      watch(p, name)
      await p.goto(`${BASE}/play/${code}`)
      await joinForm(p, name)
      await p.waitForSelector("text=You're in", { timeout: 60000 })
      players.push(p)
    }
    ok('3 players in the lobby')

    step('Host picks a 3x3 card and starts')
    await host.click('button:has-text("3 x 3")')
    await host.click('button:has-text("Start bingo")')
    await host.waitForSelector('button:has-text("Call the first item")', { timeout: 60000 })

    const cards = []
    for (const p of players) {
      await p.waitForSelector('.grid .cell', { timeout: 60000 })
      cards.push((await p.locator('.grid .cell-t').allTextContents()).join('|'))
    }
    const distinct = new Set(cards).size
    if (distinct === players.length) ok(`all ${players.length} cards are distinct`)
    else errors.push(`cards not distinct: ${distinct}/${players.length}`)

    step('Host calls 10 items; cells auto-mark (no tapping)')
    for (let i = 0; i < 10; i++) await callNext(host)
    const beforeCovered = await players[1].locator('.cell.covered').count()
    if (beforeCovered > 1) ok(`player auto-marked ${beforeCovered} cells from the calls`)
    else errors.push(`auto-mark did not cover cells (got ${beforeCovered})`)

    step('Reconnect: player reloads + rejoins by name; marks must come back')
    await players[1].reload()
    await players[1].waitForSelector('input[placeholder="e.g. Robin"], .grid .cell', { timeout: 60000 })
    if (await players[1].locator('input[placeholder="e.g. Robin"]').count()) await joinForm(players[1], NAMES[1])
    await players[1].waitForSelector('.grid .cell', { timeout: 60000 })
    let afterCovered = 0
    for (let i = 0; i < 20; i++) {
      afterCovered = await players[1].locator('.cell.covered').count()
      if (afterCovered >= beforeCovered) break
      await players[1].waitForTimeout(150)
    }
    if (afterCovered === beforeCovered) ok(`reconnect kept all ${afterCovered} covered cells (no marks lost)`)
    else errors.push(`reconnect mark loss: before=${beforeCovered} after=${afterCovered}`)

    step('Keep calling until a line completes; player claims; host verifies')
    let claimer = null
    for (let i = 0; i < 60 && !claimer; i++) {
      for (const p of players) if (await p.locator('.bingo-btn').count()) { claimer = p; break }
      if (claimer) break
      await callNext(host)
    }
    if (!claimer) {
      errors.push('no player ever reached a bingo')
    } else {
      ok('a line completed (Bingo button shown automatically)')
      await claimer.click('.bingo-btn')
      await host.waitForSelector('.winner-banner, .winners li', { timeout: 60000 })
      ok('host verified the claim and crowned a winner')
      await claimer.waitForSelector('.badge', { timeout: 60000 }).catch(() => {})
    }

    step('Overflow checks')
    await noOverflow(players[0], 'player 390px')
    await noOverflow(host, 'host 1440px')

    step('End the game -> results')
    await host.click('button:has-text("End game")')
    await host.waitForSelector('.results, .results-wrap', { timeout: 60000 })
    ok('host reached final results')

    console.log('')
    if (errors.length) {
      console.log(`✗ ${errors.length} error(s):`)
      for (const e of errors.slice(0, 20)) console.log('   ' + e)
      process.exitCode = 1
    } else {
      console.log('✓ Bingo smoke passed with no console/page errors.')
    }
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  for (const e2 of errors.slice(0, 20)) console.error('   ' + e2)
  process.exit(1)
})
