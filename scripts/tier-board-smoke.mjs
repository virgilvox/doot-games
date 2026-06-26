/**
 * Tier-board smoke / load test. Hosts the Tier List flagship (one shared S-to-D
 * board), fills it with a packed room of HEADLESS players that place every item via
 * the engine's RoomRuntime, plus a couple of real "phone" players, and checks the
 * big-screen board holds up: the consensus forms, it stays within the host screen,
 * and there are no host errors. Optionally a grade-inflation stress (everyone dumps
 * everything into S).
 *
 *   pnpm dev   then   node_modules/.bin/jiti scripts/tier-board-smoke.mjs
 *   HEADLESS=95 PHONES=2 SHOTS=1 INFLATE=0 BASE_URL=http://localhost:3000
 */
import { chromium } from 'playwright'
import { createClaspRelay, createRoom } from '@doot-games/engine'

const _log = console.log.bind(console)
console.log = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('CLASP ')) return
  _log(...a)
}

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEADLESS = Number(process.env.HEADLESS ?? 95)
const PHONES = Number(process.env.PHONES ?? 2)
const RELAY = process.env.RELAY_URL || 'wss://relay.clasp.to'
const SHOTS = process.env.SHOTS === '1'
const INFLATE = process.env.INFLATE === '1'
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/doot-tier'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}

// Each player's board: a believable consensus (items spread S->D by position) plus
// per-player noise, so the board has clear winners and a few divisive items. Inflate
// mode dumps everything into the top tier to stress one lane.
function placementsFor(name, items, tierCount) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  const out = {}
  items.forEach((it, i) => {
    if (INFLATE) {
      out[it.id] = 0
      return
    }
    const base = Math.min(tierCount - 1, Math.floor((i / items.length) * tierCount))
    const noisy = (h + i) % 4 === 0 ? Math.min(tierCount - 1, Math.max(0, base + ((h % 2) ? 1 : -1))) : base
    out[it.id] = noisy
  })
  return out
}

;(async () => {
  console.log(`Tier board: ${HEADLESS} headless + ${PHONES} phones${INFLATE ? ' (grade-inflation stress)' : ''}`)
  const browser = await chromium.launch()
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const hostErrors = []
  host.on('pageerror', (e) => hostErrors.push(String(e).slice(0, 200)))
  await host.goto(`${BASE}/host/tier-list`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  console.log(`room code ${code}`)

  // Headless players (ramped). Each reads the published board from its own snapshot
  // and places every item once the round opens.
  const players = []
  const relays = []
  let connected = 0
  let placedRounds = 0
  const spawn = async (name) => {
    const relay = createClaspRelay(RELAY)
    relays.push(relay)
    const p = createRoom({ relay, room: code, role: 'player', name })
    let done = false
    p.onChange(() => {
      const s = p.getSnapshot()
      if (done || s.phase !== 'active' || s.round.state !== 'open') return
      const cfg = s.config
      const round = cfg?.rounds?.[s.round.index]
      const items = round?.content?.items
      const tierCount = round?.content?.tiers?.length ?? 5
      if (!Array.isArray(items) || !items.length) return
      done = true
      p.submit({ placements: placementsFor(name, items, tierCount) })
      placedRounds++
    })
    players.push(p)
    await p.connect()
    connected++
  }
  const names = Array.from({ length: HEADLESS }, (_, i) => `Bot${String(i + 1).padStart(3, '0')}`)
  for (let i = 0; i < names.length; i += 10) {
    await Promise.all(names.slice(i, i + 10).map((n) => spawn(n).catch((e) => fails.push(`spawn ${n}: ${e.message}`))))
    await sleep(500)
  }
  await sleep(3000)
  console.log(`headless connected ${connected}/${HEADLESS}`)

  // Phones (real browsers) — place each item by tapping a tier chip.
  const phones = []
  for (let i = 0; i < PHONES; i++) {
    const ph = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
    try {
      await ph.goto(`${BASE}/play/${code}`)
      await ph.waitForSelector('input', { timeout: 40000 })
      await ph.fill('input[placeholder="e.g. Robin"]', `Phone${i + 1}`)
      await ph.click('button:has-text("Join game")')
      await ph.waitForSelector('text=You are in', { timeout: 40000 })
      phones.push(ph)
    } catch (e) {
      fails.push(`phone ${i + 1}: ${e.message.split('\n')[0]}`)
    }
  }
  console.log(`phones joined ${phones.length}/${PHONES}`)

  // Drive: start, open voting.
  await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
  await host.click('button:has-text("Start game")')
  await host.waitForSelector('button:has-text("Open voting"), button:has-text("Lock voting"), button:has-text("Reveal")', { timeout: 40000 })
  if (await host.locator('button:has-text("Open voting")').count()) await host.click('button:has-text("Open voting")')

  // Phones tap a chip per item, then lock in.
  for (const ph of phones) {
    try {
      await ph.bringToFront()
      await ph.waitForSelector('.tp-item', { timeout: 8000 })
      const cards = ph.locator('.tp-item')
      const n = await cards.count()
      for (let i = 0; i < n; i++) {
        const chips = cards.nth(i).locator('.tp-chip')
        const cc = await chips.count()
        if (cc) await chips.nth(i % cc).click()
      }
      await ph.click('button:has-text("Lock it in")', { timeout: 4000 })
    } catch {
      /* a slow phone; the headless crowd carries the board */
    }
  }
  await sleep(2500)
  console.log(`headless submitted ${placedRounds} boards`)

  // Capture the board while voting (live consensus forming).
  if (SHOTS) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(SHOT_DIR, { recursive: true })
    await host.screenshot({ path: `${SHOT_DIR}/host-board-open${INFLATE ? '-inflate' : ''}.png` })
  }

  // Lock (if not auto-locked) then reveal.
  if (await host.locator('button:has-text("Lock voting")').count()) {
    await sleep(1200)
    if (await host.locator('button:has-text("Lock voting")').count()) await host.click('button:has-text("Lock voting")')
  }
  await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
  await host.click('button:has-text("Reveal")')
  await sleep(1500)

  // Measure the revealed board on the host.
  const ov = await host.evaluate(() => ({
    hx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vy: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
  const lanes = await host.evaluate(() => document.querySelectorAll('.th-lane').length)
  const cells = await host.evaluate(() => document.querySelectorAll('.th-cell').length)
  console.log(`host BOARD at reveal: ${lanes} lanes, ${cells} item cells; overflow h ${ov.hx}px v ${ov.vy}px`)
  ok(ov.hx === 0, `no horizontal overflow (h=${ov.hx})`)
  ok(lanes >= 2 && cells >= 1, 'board rendered with lanes + items')
  if (SHOTS) {
    await host.screenshot({ path: `${SHOT_DIR}/host-board-reveal${INFLATE ? '-inflate' : ''}.png` })
    if (phones[0]) await phones[0].screenshot({ path: `${SHOT_DIR}/phone-reveal.png`, fullPage: true })
  }

  ok(hostErrors.length === 0, `no host page errors${hostErrors.length ? ': ' + hostErrors.slice(0, 2).join(' | ') : ''}`)

  for (const p of players) try { p.dispose() } catch { /* */ }
  for (const r of relays) try { r.close() } catch { /* */ }
  await browser.close()
  console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL GREEN')
  process.exit(fails.length ? 1 : 0)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
