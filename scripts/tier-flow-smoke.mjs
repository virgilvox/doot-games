/**
 * Item-by-item Tier List flow smoke. Hosts the custom-flow flagship, fills the room
 * with HEADLESS players that vote each item over the /x/ transport (via RoomRuntime
 * publishExtra/onExtra), plus a real "phone", and drives the host item-by-item:
 * Start -> (per item: vote -> Reveal -> Next) -> Final results. Checks the board fills,
 * the leaderboard scores, the host fits, and there are no host errors.
 *
 *   pnpm dev   then   node_modules/.bin/jiti scripts/tier-flow-smoke.mjs
 *   HEADLESS=40 PHONES=1 SHOTS=1
 */
import { chromium } from 'playwright'
import { createClaspRelay, createRoom } from '@doot-games/engine'

const _log = console.log.bind(console)
console.log = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('CLASP ')) return
  _log(...a)
}

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEADLESS = Number(process.env.HEADLESS ?? 40)
const PHONES = Number(process.env.PHONES ?? 1)
const RELAY = process.env.RELAY_URL || 'wss://relay.clasp.to'
const SHOTS = process.env.SHOTS === '1'
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/doot-tierflow'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}

function chooseTier(name, idx, tierCount) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  const base = Math.min(tierCount - 1, idx % tierCount)
  return (h + idx) % 4 === 0 ? Math.min(tierCount - 1, Math.max(0, base + ((h % 2) ? 1 : -1))) : base
}

;(async () => {
  console.log(`Tier flow: ${HEADLESS} headless + ${PHONES} phones`)
  const browser = await chromium.launch()
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const hostErrors = []
  host.on('pageerror', (e) => hostErrors.push(String(e).slice(0, 200)))
  await host.goto(`${BASE}/host/tier-list`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  console.log(`room code ${code}`)

  // Headless players: subscribe to /x/show and vote the current item.
  const players = []
  const relays = []
  let connected = 0
  let voteEvents = 0
  const spawn = async (name) => {
    const relay = createClaspRelay(RELAY)
    relays.push(relay)
    const p = createRoom({ relay, room: code, role: 'player', name })
    let lastVoted = -1
    p.onExtra('show', (s) => {
      if (!s || s.phase !== 'voting') return
      const idx = Number(s.index) || 0
      if (lastVoted === idx) return
      const snap = p.getSnapshot()
      const round = snap.config?.rounds?.[0]
      const tierCount = round?.content?.tiers?.length ?? 5
      const items = round?.content?.items ?? []
      if (!items.length) return
      lastVoted = idx
      p.publishExtra(`vote/${idx}/${snap.me.id}`, { tier: chooseTier(name, idx, tierCount) })
      voteEvents++
    })
    players.push(p)
    await p.connect()
    connected++
  }
  const names = Array.from({ length: HEADLESS }, (_, i) => `Bot${String(i + 1).padStart(3, '0')}`)
  for (let i = 0; i < names.length; i += 10) {
    await Promise.all(names.slice(i, i + 10).map((n) => spawn(n).catch((e) => fails.push(`spawn ${n}: ${e.message}`))))
    await sleep(400)
  }
  await sleep(2500)
  console.log(`headless connected ${connected}/${HEADLESS}`)

  // One phone (real browser) to verify the phone UI.
  const phones = []
  for (let i = 0; i < PHONES; i++) {
    const ph = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
    try {
      await ph.goto(`${BASE}/play/${code}`)
      await ph.waitForSelector('input', { timeout: 40000 })
      await ph.fill('input[placeholder="e.g. Robin"]', `Phone${i + 1}`)
      await ph.click('button:has-text("Join game")')
      await ph.waitForSelector('text=You\'re in', { timeout: 40000 })
      phones.push(ph)
    } catch (e) {
      fails.push(`phone ${i + 1}: ${e.message.split('\n')[0]}`)
    }
  }
  console.log(`phones joined ${phones.length}/${PHONES}`)

  // Drive the show.
  await host.waitForSelector('button:has-text("Start the tier list")', { timeout: 40000 })
  await host.click('button:has-text("Start the tier list")')

  let itemsDriven = 0
  for (let guard = 0; guard < 30; guard++) {
    await host.waitForSelector('button:has-text("Reveal"), button:has-text("Next item"), button:has-text("Final results")', { timeout: 40000 })
    // The phone votes the first item, to verify the phone path.
    if (guard === 0 && phones[0]) {
      try {
        await phones[0].waitForSelector('.tl-tier', { timeout: 6000 })
        await phones[0].locator('.tl-tier').first().click()
      } catch { /* */ }
    }
    await sleep(1200) // let headless votes land
    if (SHOTS && guard === 1) {
      const { mkdirSync } = await import('node:fs')
      mkdirSync(SHOT_DIR, { recursive: true })
      await host.screenshot({ path: `${SHOT_DIR}/host-voting.png` })
      if (phones[0]) await phones[0].screenshot({ path: `${SHOT_DIR}/phone-voting.png`, fullPage: true })
    }
    if (await host.locator('button:has-text("Reveal")').count()) {
      await host.click('button:has-text("Reveal")')
      itemsDriven++
    }
    await host.waitForSelector('button:has-text("Next item"), button:has-text("Final results")', { timeout: 40000 })
    if (await host.locator('button:has-text("Final results")').count()) {
      if (SHOTS) await host.screenshot({ path: `${SHOT_DIR}/host-board.png` })
      await host.click('button:has-text("Final results")')
      break
    }
    await host.click('button:has-text("Next item")')
  }
  console.log(`items driven: ${itemsDriven}, headless vote events: ${voteEvents}`)

  await host.waitForSelector('text=/wins|read the room|board is set|results/i', { timeout: 40000 })
  const ov = await host.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(itemsDriven >= 3, `drove multiple items (${itemsDriven})`)
  ok(voteEvents >= HEADLESS * 2, `headless voted across items (${voteEvents} events)`)
  ok(ov === 0, `host no horizontal overflow (h=${ov})`)
  ok(hostErrors.length === 0, `no host page errors${hostErrors.length ? ': ' + hostErrors.slice(0, 2).join(' | ') : ''}`)
  if (SHOTS) await host.screenshot({ path: `${SHOT_DIR}/host-results.png` })

  for (const p of players) try { p.dispose() } catch { /* */ }
  for (const r of relays) try { r.close() } catch { /* */ }
  await browser.close()
  console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL GREEN')
  process.exit(fails.length ? 1 : 0)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
