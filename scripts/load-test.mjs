/**
 * Load test: 50-100 players in ONE block-composed game (made with the `custom`
 * block-creator type: guess + poll + guess). The HOST and a handful of "phone"
 * players are real Playwright browsers (so we watch the real UI under load); the
 * rest are HEADLESS players that connect straight to the CLASP relay via the
 * engine's real RoomRuntime (no DOM, far cheaper) and auto-answer each round.
 *
 * Run with jiti (it resolves the TS engine package + the extensionless imports):
 *   pnpm dev   then   node_modules/.bin/jiti scripts/load-test.mjs
 *
 * Env: BASE_URL (default http://localhost:3000), HEADLESS (default 70 virtual
 * players), PHONES (default 5 browser players), SHOTS=1 to save screenshots.
 */
import { chromium } from 'playwright'
import { createClaspRelay, createRoom, makeRoomCode } from '@doot-games/engine'

// @clasp-to/core logs every publish ACK to stdout; mute that noise, keep our logs.
const _log = console.log.bind(console)
console.log = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('CLASP ')) return
  _log(...a)
}

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEADLESS = Number(process.env.HEADLESS ?? 70)
const PHONES = Number(process.env.PHONES ?? 5)
const RELAY = process.env.RELAY_URL || 'wss://relay.clasp.to'
const SHOTS = process.env.SHOTS === '1'
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/doot-loadtest'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now()
void makeRoomCode // (engine sanity import)

const log = (...a) => console.log(...a)
const fails = []

// ── 1. Author + save the game (custom = the block creator's "any blocks" type) ──
async function saveGame() {
  const email = `loadtest_${now()}@doot.dev`
  const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: 'supersecret123', name: 'loadtest' }),
  })
  const cookie = (su.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) throw new Error(`signup gave no cookie (status ${su.status})`)
  const game = {
    pluginId: 'custom',
    themeId: 'doot',
    visibility: 'unlisted',
    config: {
      title: 'Load Test Party',
      rounds: [
        { block: 'guess', content: { prompt: 'Round 1 - the answer is A', timer: null, options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }], correct: 0 } },
        { block: 'poll', content: { prompt: 'Round 2 - best party snack?', timer: null, options: [{ label: 'Pizza' }, { label: 'Tacos' }, { label: 'Wings' }, { label: 'Chips' }] } },
        { block: 'guess', content: { prompt: 'Round 3 - the answer is C', timer: null, options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }], correct: 2 } },
      ],
    },
  }
  const res = await fetch(`${BASE}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: JSON.stringify(game),
  })
  if (!res.ok) throw new Error(`save game ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { id } = await res.json()
  return { id, cookie }
}

// Deterministic-but-varied answer per player+round (so the leaderboard isn't flat).
function chooseFor(name, idx) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  // Round 0 correct=A(0), round 2 correct=C(2): make ~60% pick correct, rest spread.
  if (idx === 0) return h % 5 === 0 ? 1 : 0
  if (idx === 2) return h % 5 === 0 ? 3 : 2
  return h % 4 // poll: spread across all four
}

async function rosterCount(page) {
  try {
    const txt = await page.evaluate(() => document.body.innerText)
    const m = /(\d+)\s+joined/.exec(txt || '')
    return m ? Number(m[1]) : 0
  } catch {
    return 0
  }
}

const run = { roundSubmits: {}, t: {} }

;(async () => {
  log(`Load test: ${HEADLESS} headless + ${PHONES} phones + 1 host, relay ${RELAY}`)
  const { id: gameId, cookie } = await saveGame()
  log(`saved game ${gameId}`)

  const browser = await chromium.launch()
  const ownerCookie = (() => {
    const [name, value] = cookie.split('=')
    return { name, value, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }
  })()

  // Horizontal overflow (must be 0) + vertical overflow (a fixed host view should
  // not scroll; the lobby may). Measured against the real host viewport.
  const overflow = (page) =>
    page.evaluate(() => ({
      hx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      vy: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }))

  // Host (real browser, owner-cookied so it can host the unlisted game), sized to a
  // real host screen so layout-at-scale is honest.
  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await hostCtx.addCookies([ownerCookie])
  const host = await hostCtx.newPage()
  const hostErrors = []
  host.on('pageerror', (e) => hostErrors.push(String(e).slice(0, 200)))
  await host.goto(`${BASE}/host/g/${gameId}`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  log(`room code ${code}`)

  // ── Headless players, ramped in batches to avoid a connection burst ──
  const players = []
  const relays = []
  let connected = 0
  const spawn = async (name) => {
    const relay = createClaspRelay(RELAY)
    relays.push(relay)
    const p = createRoom({ relay, room: code, role: 'player', name })
    const submitted = new Set()
    p.onChange(() => {
      const s = p.getSnapshot()
      if (s.phase === 'active' && s.round.state === 'open') {
        const i = s.round.index
        if (!submitted.has(i)) {
          submitted.add(i)
          p.submit({ choice: chooseFor(name, i) })
          run.roundSubmits[i] = (run.roundSubmits[i] || 0) + 1
        }
      }
    })
    p.__submitted = submitted
    players.push(p)
    await p.connect()
    connected++
  }
  const names = Array.from({ length: HEADLESS }, (_, i) => `Bot${String(i + 1).padStart(3, '0')}`)
  const tConnect = now()
  for (let i = 0; i < names.length; i += 10) {
    await Promise.all(names.slice(i, i + 10).map((n) => spawn(n).catch((e) => { fails.push(`spawn ${n}: ${e.message}`) })))
    await sleep(500)
  }
  run.t.connectMs = now() - tConnect
  await sleep(3000) // let profiles publish + roster settle
  const ready = players.filter((p) => p.getSnapshot().ready).length
  log(`headless: connected=${connected}/${HEADLESS} ready=${ready} (in ${run.t.connectMs}ms, ${fails.length} spawn fails)`)

  // ── Phone players (real browsers) ──
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
  log(`phones joined: ${phones.length}/${PHONES}`)

  // Wait for the host roster to reflect the crowd (presence-based, climbs as they heartbeat).
  const target = connected + phones.length
  let roster = 0
  for (let i = 0; i < 30; i++) {
    roster = await rosterCount(host)
    if (roster >= Math.floor(target * 0.9)) break
    await sleep(1000)
  }
  log(`host roster sees ${roster} of ${target} expected players`)
  run.rosterSeen = roster
  run.target = target

  // Layout check: the lobby roster at full scale.
  const lobbyOv = await overflow(host)
  log(`host LOBBY overflow: horizontal ${lobbyOv.hx}px, vertical ${lobbyOv.vy}px (roster of ${roster})`)
  run.lobbyOv = lobbyOv
  if (SHOTS) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(SHOT_DIR, { recursive: true })
    await host.screenshot({ path: `${SHOT_DIR}/host-lobby.png` })
  }

  // ── Drive the game; phones submit via UI, headless auto-submit on open ──
  const submitPhones = async () => {
    // Foreground each phone first: backgrounded Playwright tabs throttle timers,
    // which delays the next round's options rendering (the known gotcha).
    for (const ph of phones) {
      try {
        await ph.bringToFront()
        await ph.waitForSelector('.opt', { timeout: 6000 })
        await ph.locator('.opt').first().click()
        await ph.click('button:has-text("Lock it in")', { timeout: 4000 })
      } catch {
        /* this phone may already be locked / on a non-input view */
      }
    }
  }

  await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
  await host.click('button:has-text("Start game")')

  for (let guard = 0; guard < 12; guard++) {
    // Open the round (untimed rounds wait for the host; auto-advance only auto-LOCKS).
    await host.waitForSelector('button:has-text("Open voting"), button:has-text("Lock voting"), button:has-text("Reveal")', { timeout: 40000 })
    if (await host.locator('button:has-text("Open voting")').count()) {
      await host.click('button:has-text("Open voting")')
    }
    // Crowd answers. Headless submit on 'open' is near-instant; phones via UI.
    const tLock = now()
    await submitPhones()
    // With auto-advance ON, the round auto-locks once EVERY eligible player is in,
    // so "Lock voting" may already be gone (now "Reveal"). Lock manually only if a
    // straggler kept it open.
    await host.waitForSelector('button:has-text("Lock voting"), button:has-text("Reveal")', { timeout: 40000 })
    if (await host.locator('button:has-text("Lock voting")').count()) {
      await sleep(1500) // give auto-lock a beat to catch the last submissions
      if (await host.locator('button:has-text("Lock voting")').count()) {
        await host.click('button:has-text("Lock voting")')
      }
    }
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    const lockToReveal = now() - tLock
    const tReveal = now()
    await host.click('button:has-text("Reveal")')
    await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
    const revealToNext = now() - tReveal
    log(`  round ${guard}: crowd-in+lock ${lockToReveal}ms, reveal->next ${revealToNext}ms`)

    if (await host.locator('button:has-text("Final results")').count()) {
      await host.click('button:has-text("Final results")')
      break
    }
    await host.click('button:has-text("Next round")')
  }

  // ── Results ──
  await host.waitForSelector('.results', { timeout: 40000 })
  await sleep(800)
  log('host results rendered')
  // The win headline at scale (was a wall of 76 names before the cap).
  const headline = await host.evaluate(() => document.querySelector('.rhead h1')?.textContent?.trim() ?? '')
  log(`results headline: "${headline}"`)
  const resultsOv = await overflow(host)
  log(`host RESULTS overflow: horizontal ${resultsOv.hx}px, vertical ${resultsOv.vy}px (should be ~0/0, fixed view)`)
  run.resultsOv = resultsOv
  // The leaderboard slide is the first carousel page when the game scored. Confirm it's
  // bounded (capped at 10 rows) and reachable.
  const board = await host.evaluate(() => {
    const rows = [...document.querySelectorAll('.lb-row')]
    return { count: rows.length, top: rows.slice(0, 3).map((r) => r.textContent.replace(/\s+/g, ' ').trim()) }
  })
  log(`leaderboard slide: ${board.count} rows shown (capped), top: ${JSON.stringify(board.top)}`)

  log('\n── METRICS ──')
  log(`players: target ${run.target}, host roster saw ${run.rosterSeen}`)
  log(`headless connected: ${connected}/${HEADLESS}, ready: ${ready}`)
  log(`submissions per round (headless): ${JSON.stringify(run.roundSubmits)}`)
  log(`host page errors: ${hostErrors.length}${hostErrors.length ? ' :: ' + hostErrors.slice(0, 3).join(' | ') : ''}`)
  log(`spawn/join fails: ${fails.length}${fails.length ? ' :: ' + fails.slice(0, 3).join(' | ') : ''}`)

  if (phones[0]) {
    await phones[0].bringToFront()
    const phoneOv = await overflow(phones[0])
    log(`phone RESULTS overflow: horizontal ${phoneOv.hx}px (should be 0; phone scrolls vertically by design)`)
    run.phoneOv = phoneOv
  }

  if (SHOTS) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(SHOT_DIR, { recursive: true })
    await host.screenshot({ path: `${SHOT_DIR}/host-results.png` })
    // Page the carousel one slide to confirm it advances (leaderboard -> next breakdown).
    await host.keyboard.press('ArrowRight')
    await sleep(500)
    await host.screenshot({ path: `${SHOT_DIR}/host-results-2.png` })
    if (phones[0]) await phones[0].screenshot({ path: `${SHOT_DIR}/phone-results.png`, fullPage: true })
    log(`screenshots -> ${SHOT_DIR}`)
  }

  // Cleanup
  for (const p of players) try { p.dispose() } catch { /* */ }
  for (const r of relays) try { r.close() } catch { /* */ }
  await browser.close()

  const ok = hostErrors.length === 0 && run.rosterSeen >= Math.floor(run.target * 0.85)
  log(ok ? '\nLOAD TEST OK' : '\nLOAD TEST: see warnings above')
  process.exit(ok ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
