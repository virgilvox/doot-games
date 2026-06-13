/**
 * Real-browser smoke of Pit Party (the 3D kart racer). Drives the HOST through a
 * FULL race: lobby mounts + the Three.js engine inits a WebGL canvas -> add a
 * keyboard driver -> PICK & RACE -> START RACE -> countdown + split HUD -> a
 * steering assist drives the keyboard kart (via the dev-only window.__pitRace
 * handle) through 2 laps -> the results screen shows all 8 finishers. A PHONE
 * joins, picks a driver + kart, and gets the controller. Asserts no fatal page
 * errors and screenshots every surface to /tmp (pp-lobby, pp-select, pp-count,
 * pp-hud, pp-drive, pp-results).
 *
 * Run: `pnpm dev` in one shell, then `node scripts/pit-party-smoke.mjs`.
 * Set PP_QUICK=1 to skip the full race (stops after the controller renders).
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const QUICK = !!process.env.PP_QUICK
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []

// Ignore platform noise we don't control: the relay socket, audio autoplay policy,
// WebGL/Three warnings, favicon, auth base URL. Keep real mount/undefined crashes.
const NOISE =
  /favicon|autoplay|not allowed to start|AudioContext|Better Auth|baseURL|net::|relay\.clasp|websocket|ws:|wss:|CORS|Access-Control|WebGL|THREE|Failed to (load|fetch)|404|preload|deviceorientation/i

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (NOISE.test(t)) return
    errors.push(`[${who} console] ${t}`)
  })
  page.on('pageerror', (e) => {
    if (NOISE.test(e.message)) return
    errors.push(`[${who} pageerror] ${e.message}`)
  })
}

const run = async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const ctx = await browser.newContext()

  // ---- HOST ----------------------------------------------------------------
  // modest viewport: the smoke renders through SwiftShader (software GL), and a
  // big canvas slows rAF enough to dilate the sim clock vs the wall clock
  const host = await ctx.newPage()
  await host.setViewportSize({ width: 1100, height: 620 })
  watch(host, 'host')
  step('host opens /host/pit-party')
  await host.goto(`${BASE}/host/pit-party`, { waitUntil: 'domcontentloaded' })
  await host.waitForSelector('h1:has-text("PIT PARTY")', { timeout: 60000 })
  ok('lobby mounted')

  // the Three.js engine appends a WebGL <canvas> into .stage when it inits
  await host.waitForSelector('.stage canvas', { timeout: 20000 })
  ok('engine canvas present (WebGL inited)')
  await host.waitForTimeout(800)
  await host.screenshot({ path: '/tmp/pp-lobby.png' })
  ok('lobby shot: /tmp/pp-lobby.png')

  const code = (await host.locator('.bigcode').first().innerText()).trim()
  if (!/^[A-Z2-9]{4}$/.test(code)) throw new Error(`bad room code: "${code}"`)
  ok(`room code ${code}`)

  // 2 laps so the full race fits a smoke run; a 3-race cup so we can assert the
  // course auto-advances after race 1
  await host.click('button:has-text("LAPS")') // 3 -> 5
  await host.click('button:has-text("LAPS")') // 5 -> 2
  await host.click('button:has-text("SINGLE RACE")') // -> 3-race cup
  await host.click('button:has-text("KEYBOARD")')
  await host.waitForTimeout(300)
  ok('keyboard driver added (2 laps, 3-race cup)')

  // ---- PLAYER (join + select) ---------------------------------------------
  // a landscape phone, so the controller renders in its intended layout
  const phoneCtx = await browser.newContext({ viewport: { width: 760, height: 360 }, isMobile: true, hasTouch: true })
  const phone = await phoneCtx.newPage()
  watch(phone, 'phone')
  step(`phone opens /play/${code}`)
  await phone.goto(`${BASE}/play/${code}`, { waitUntil: 'domcontentloaded' })
  await phone.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await phone.fill('input[placeholder="e.g. Robin"]', 'SMOKE')
  await phone.click('button:has-text("Join game")')
  const recon = phone.locator('button:has-text("reconnect")')
  try {
    await recon.waitFor({ state: 'visible', timeout: 2500 })
    await recon.click()
  } catch {
    /* fresh join */
  }
  try {
    await phone.waitForSelector('.ctile', { timeout: 30000 })
  } catch (e) {
    await phone.screenshot({ path: '/tmp/pp-phone.png' })
    console.log('  phone body text:', (await phone.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200))
    throw e
  }
  ok('phone reached driver-select (character tiles render)')
  await phone.locator('.ctile:not(.taken)').nth(2).click()
  await phone.locator('.ktile').nth(1).click()
  await phone.screenshot({ path: '/tmp/pp-select.png' })
  ok('phone picked a driver + a kart (shot: /tmp/pp-select.png)')

  // ---- HOST: run the race --------------------------------------------------
  step('host starts the race')
  await host.click('button:has-text("PICK & RACE")')
  await host.waitForSelector('h1:has-text("CHOOSE YOUR RIDE")', { timeout: 10000 })
  ok('selection screen')
  await host.click('button:has-text("START RACE")')
  // countdown + race: the split HUD pane appears (proves the sim loop + renderer ran)
  await host.waitForSelector('.hud .pane', { timeout: 12000 })
  await host.screenshot({ path: '/tmp/pp-count.png' })
  ok('race HUD pane rendered (shot: /tmp/pp-count.png)')
  // the phone should now show the controller (joystick default)
  await phone.waitForSelector('.drive .ctrlZone', { timeout: 8000 })
  await phone.waitForTimeout(1500)
  await phone.screenshot({ path: '/tmp/pp-drive.png' })
  ok('phone controller rendered (shot: /tmp/pp-drive.png)')

  // the dev-only sim handle exists (smokes assert REAL race state through it)
  const hasSim = await host.evaluate(() => !!window.__pitRace)
  if (!hasSim) throw new Error('window.__pitRace missing (dev handle)')
  ok('sim handle present')

  await host.waitForTimeout(3000) // let the race actually run a few seconds
  const placeTxt = await host.locator('.pane .place').first().innerText()
  ok(`pane shows a placing: "${placeTxt.replace(/\s+/g, ' ').trim()}"`)

  if (QUICK) {
    await browser.close()
    report()
    return
  }

  // ---- FULL RACE: steering assist on the keyboard kart ---------------------
  // keep the host tab foregrounded: a backgrounded headless tab throttles rAF,
  // which is what drives the sim loop (a real big screen is always visible)
  await host.bringToFront()
  step('assist drives the keyboard kart to the finish')
  await host.evaluate(() => {
    window.__assist = setInterval(() => {
      const race = window.__pitRace
      if (!race) return
      const k = race.karts.find((x) => x.id === 'kb')
      if (!k || k.finished) return
      const t = race.track
      const look = Math.round(14 + Math.abs(k.speed) * 0.6)
      const s = t.samples[(k.idx + look) % t.n]
      const want = Math.atan2(s.x - k.x, s.z - k.z)
      let err = want - k.heading
      while (err > Math.PI) err -= Math.PI * 2
      while (err < -Math.PI) err += Math.PI * 2
      // Host negates keyboard steer to match the screen, so 'a' = world right
      const dir = err > 0.06 ? 'a' : err < -0.06 ? 'd' : null
      for (const key of ['a', 'd'])
        window.dispatchEvent(new KeyboardEvent(key === dir ? 'keydown' : 'keyup', { key }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))
    }, 80)
  })
  await host.waitForTimeout(20000)
  await host.screenshot({ path: '/tmp/pp-hud.png' })
  const lap = await host.evaluate(() => window.__pitRace?.karts.find((x) => x.id === 'kb')?.lap ?? 0)
  if (lap < 1) throw new Error('keyboard kart made no lap progress')
  ok(`mid-race HUD shot at lap ${lap}: /tmp/pp-hud.png`)

  // results: every kart placed (the race ALWAYS ends now: AI pace + stuck rescue)
  try {
    await host.waitForSelector('.resFrame', { timeout: 320000 })
  } catch (e) {
    const st = await host.evaluate(() => {
      const r = window.__pitRace
      if (!r) return 'no sim'
      return `state=${r.state} t=${(r.raceTime / 1000).toFixed(0)}s ffa=${(r.firstFinishAt / 1000).toFixed(0)}s ${r.karts
        .map((k) => `${k.id}:L${k.lap}cp${k.nextCp}v${k.speed.toFixed(0)}${k.finished ? 'F' : ''}${k.human ? 'H' : ''}`)
        .join(' ')}`
    })
    await host.screenshot({ path: '/tmp/pp-stall.png' })
    throw new Error(`race never reached results; sim: ${st}`)
  }
  await host.evaluate(() => clearInterval(window.__assist))
  await host.waitForTimeout(600)
  await host.screenshot({ path: '/tmp/pp-results.png' })
  const rows = await host.locator('.resRow').count()
  if (rows !== 8) throw new Error(`results show ${rows} rows, expected 8`)
  ok('results screen: 8 finishers + cup standings (shot: /tmp/pp-results.png)')
  const placed = await host.evaluate(() =>
    window.__pitRace.karts.every((k) => k.finished && k.place >= 1 && k.place <= 8),
  )
  if (!placed) throw new Error('not every kart got a unique place')
  ok('every kart finished with a place')

  // ---- CUP: the next race starts on the NEXT course -------------------------
  step('cup advances to race 2 on a new course')
  await host.click('button:has-text("NEXT RACE")')
  await host.waitForSelector('.hud .pane', { timeout: 12000 })
  const bar = (await host.locator('.topbar').innerText()).replace(/\s+/g, ' ')
  if (!/RACE 2\/3/.test(bar)) throw new Error(`topbar lacks RACE 2/3: "${bar}"`)
  if (/KILN CANYON/.test(bar)) throw new Error('course did not advance for race 2')
  ok(`race 2 running on the next course ("${bar.trim().slice(0, 60)}...")`)

  await browser.close()
  report()
}

function report() {
  if (errors.length) {
    console.log('\nFATAL ERRORS:')
    for (const e of errors) console.log('  ' + e)
    process.exit(1)
  }
  console.log('\nPIT PARTY SMOKE: PASS')
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  process.exit(1)
})
