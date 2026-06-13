/**
 * Real-browser smoke of Pit Party (the 3D kart racer). Drives the HOST through a
 * full keyboard-only race: lobby mounts + the Three.js engine inits a WebGL canvas
 * -> add a keyboard driver -> PICK & RACE -> START RACE -> the countdown + split
 * HUD pane appear (so the sim loop + renderer actually ran). Then a PHONE opens the
 * join link and reaches the driver-select screen. Asserts no fatal page errors, the
 * engine canvas exists, the race HUD shows, and the player controller mounts.
 *
 * Run: `pnpm dev` in one shell, then `node scripts/pit-party-smoke.mjs`.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
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
  const host = await ctx.newPage()
  watch(host, 'host')
  step('host opens /host/pit-party')
  await host.goto(`${BASE}/host/pit-party`, { waitUntil: 'domcontentloaded' })
  await host.waitForSelector('h1:has-text("PIT PARTY")', { timeout: 60000 })
  ok('lobby mounted')

  // the Three.js engine appends a WebGL <canvas> into .stage when it inits
  await host.waitForSelector('.stage canvas', { timeout: 20000 })
  ok('engine canvas present (WebGL inited)')

  const code = (await host.locator('.bigcode').first().innerText()).trim()
  if (!/^[A-Z2-9]{4}$/.test(code)) throw new Error(`bad room code: "${code}"`)
  ok(`room code ${code}`)

  await host.click('button:has-text("KEYBOARD")')
  await host.waitForTimeout(300)
  ok('keyboard driver added')

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
  await phone.locator('.ctile').nth(2).click()
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
  ok('race HUD pane rendered (sim loop + engine running)')
  // the phone should now show the redesigned controller (joystick default)
  await phone.waitForSelector('.drive .ctrlZone', { timeout: 8000 })
  await phone.waitForTimeout(1500)
  await phone.screenshot({ path: '/tmp/pp-drive.png' })
  ok('phone controller rendered (shot: /tmp/pp-drive.png)')
  await host.waitForTimeout(3000) // let the race actually run a few seconds
  const placeTxt = await host.locator('.pane .place').first().innerText()
  ok(`pane shows a placing: "${placeTxt.replace(/\s+/g, ' ').trim()}"`)

  await browser.close()
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
