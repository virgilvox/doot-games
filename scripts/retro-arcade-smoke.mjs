/**
 * Real-browser smoke of Retro Arcade (the custom emulator flow). Drives a host +
 * a phone through: host loads a ROM URL (auto-detects the console + offers a share
 * link) -> boots & opens the room -> a phone joins and gets the NES controller ->
 * the phone resizes its buttons -> a second phone takes seat P2. Asserts the
 * controller renders, the seat panel fills, the size control scales the pad, and
 * zero horizontal overflow. The emulator core loads from its CDN; a dummy ROM url
 * won't actually run a game, but the relay control plumbing (meta + seat assign +
 * the rendered pad) is exactly what this checks. Run: pnpm dev then node this.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ROM = 'https://example.com/demo.nes'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Ignore noise + everything EmulatorJS/CDN/ROM-fetch related (we feed a dummy ROM).
    if (
      /favicon|autoplay|not allowed to start|AudioContext|Better Auth|baseURL|emulatorjs|EJS|loader\.js|wasm|net::|404|Failed to (load|fetch)|cdn\.|CORS|XMLHttpRequest|Access-Control/i.test(
        t,
      )
    )
      return
    errors.push(`[${who} console] ${t}`)
  })
  page.on('pageerror', (e) => {
    // EmulatorJS-internal errors against the dummy ROM (no real game/gameManager).
    if (/emulatorjs|EJS|wasm|gameManager|setVariable|getContext/i.test(e.message)) return
    errors.push(`[${who} pageerror] ${e.message}`)
  })
}

async function joinForm(page, name) {
  await page.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await page.fill('input[placeholder="e.g. Robin"]', name)
  await page.click('button:has-text("Join game")')
  const recon = page.locator('button:has-text("reconnect")')
  try {
    await recon.waitFor({ state: 'visible', timeout: 2500 })
    await recon.click()
  } catch {
    /* fresh join */
  }
}

async function noOverflow(page, label) {
  const o = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (o > 1) errors.push(`${label}: horizontal overflow of ${o}px`)
  else ok(`${label}: no horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Explore lists the Retro Arcade flagship')
    const ex = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage()
    watch(ex, 'explore')
    await ex.goto(`${BASE}/explore`)
    await ex.waitForSelector('text=Retro Arcade', { timeout: 60000 })
    ok('Retro Arcade card present on /explore')

    step('Host opens Retro Arcade and loads a ROM URL')
    const host = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage()
    watch(host, 'host')
    await host.goto(`${BASE}/host/retro-arcade`)
    await host.waitForSelector('.big-code', { timeout: 60000 })
    const code = (await host.textContent('.big-code')).trim()
    ok(`room code = ${code}`)
    await host.fill('input[type="text"]', ROM)
    await host.waitForSelector('.detected', { timeout: 10000 })
    const detected = await host.textContent('.detected')
    if (/NES/.test(detected)) ok('console auto-detected from the .nes URL')
    else errors.push(`console not auto-detected: "${detected}"`)
    if (await host.locator('button:has-text("Copy share link")').count())
      ok('share link offered for a ROM URL')
    else errors.push('no share link button for a ROM URL')

    step('A phone joins before boot (waiting state)')
    const p1 = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    watch(p1, 'P1')
    await p1.goto(`${BASE}/play/${code}`)
    await joinForm(p1, 'Ada')
    await p1.waitForSelector("text=You're in", { timeout: 60000 })
    ok('phone shows the waiting screen before a game loads')

    step('Host boots & opens the room')
    await host.click('button:has-text("Boot & open room")')
    await host.waitForSelector('#arcade-screen', { timeout: 60000 })
    await host.waitForSelector('.seats .seat', { timeout: 60000 })
    // Spy on the emulator input so we can prove a phone press actually reaches it
    // (a dummy ROM has no real gameManager; the readiness poll picks up this spy).
    await host.evaluate(() => {
      window.__sim = []
      // Augment (don't replace) the gameManager so EmulatorJS's other methods
      // survive; record every simulateInput.
      const install = () => {
        window.EJS_emulator = window.EJS_emulator || {}
        const gm = window.EJS_emulator.gameManager || {}
        if (!gm.__spied) {
          const orig = gm.simulateInput
          gm.simulateInput = (p, i, v) => {
            window.__sim.push([p, i, v])
            orig?.call?.(gm, p, i, v)
          }
          gm.__spied = true
        }
        window.EJS_emulator.gameManager = gm
      }
      install()
      setInterval(install, 200)
    })
    ok('host switched to the live emulator view with a seat panel')

    step('Phone receives the NES controller')
    await p1.waitForSelector('.dpad', { timeout: 60000 })
    const padBtns = await p1.locator('.pad-btn').count()
    if (padBtns >= 2) ok(`phone rendered the NES pad (${padBtns} face buttons + d-pad)`)
    else errors.push(`controller did not render (pad-btn count ${padBtns})`)

    step('A button press reaches the emulator (input wiring)')
    await p1.waitForTimeout(400)
    await p1.locator('.pad-btn[aria-label="A"]').first().click({ force: true })
    await p1.waitForTimeout(500)
    const sims = await host.evaluate(() => window.__sim || [])
    // NES A is simulateInput index 8; expect a press (1) and release (0).
    const pressedA = sims.some((s) => s[1] === 8 && s[2] === 1) && sims.some((s) => s[1] === 8 && s[2] === 0)
    if (pressedA) ok(`pressing A drove simulateInput (${sims.length} calls)`)
    else errors.push(`pressing A did NOT reach the emulator (sims: ${JSON.stringify(sims)})`)

    step('Phone resizes its buttons (the size control scales the pad)')
    const before = await p1.locator('.dpad').boundingBox()
    await p1.click('.cog')
    await p1.click('.settings button:has-text("XL")')
    await p1.waitForTimeout(200)
    const after = await p1.locator('.dpad').boundingBox()
    if (after && before && after.width > before.width + 4)
      ok(
        `button-size XL scaled the d-pad ${Math.round(before.width)}px -> ${Math.round(after.width)}px`,
      )
    else
      errors.push(
        `size control did not scale the pad (before ${before?.width} after ${after?.width})`,
      )

    step('Second phone takes seat P2')
    const p2 = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    watch(p2, 'P2')
    await p2.goto(`${BASE}/play/${code}`)
    await joinForm(p2, 'Boo')
    await p2.waitForSelector('.dpad', { timeout: 60000 })
    await host.waitForTimeout(400)
    const filled = await host.locator('.seat.on').count()
    if (filled >= 2) ok(`seat panel shows ${filled} filled slots (phones share the pool)`)
    else errors.push(`expected 2 filled seats, got ${filled}`)

    step('Hot-swap to a 1-controller console (Game Boy): P2 loses its seat')
    await host.selectOption('.swap-sys', 'gb')
    await host.click('button:has-text("Swap ROM")')
    // P1 keeps its seat (re-skins to the GB pad); P2 is evicted past the new max.
    let p2Full = false
    for (let i = 0; i < 30; i++) {
      if (await p2.locator('text=Room full').count()) {
        p2Full = true
        break
      }
      await p2.waitForTimeout(150)
    }
    if (p2Full) ok('P2 was evicted to "Room full" after the swap to a 1-slot console')
    else errors.push('P2 kept a seat after a hot-swap to a smaller console (seat not trimmed)')
    await host.waitForTimeout(300)
    const maxText = await host.textContent('.card-h h3')
    if (/\/1\b/.test(maxText)) ok(`host seat panel now shows the GB max (${maxText.trim()})`)
    else errors.push(`host seat panel did not shrink to /1: "${maxText}"`)
    await p1.waitForSelector('.dpad', { timeout: 60000 })
    ok('P1 kept its controller across the swap')

    step('Overflow checks (default size, and XL contained)')
    await p1.click('.settings button:has-text("M")')
    await p1.waitForTimeout(150)
    await noOverflow(p1, 'phone 390px (size M)')
    await p1.click('.settings button:has-text("XL")')
    await p1.waitForTimeout(150)
    await noOverflow(p1, 'phone 390px (size XL contained)')
    await noOverflow(host, 'host 1440px')

    await p1.screenshot({ path: '/tmp/arcade-player.png' })
    await host.screenshot({ path: '/tmp/arcade-host.png' })

    console.log('')
    if (errors.length) {
      console.log(`✗ ${errors.length} error(s):`)
      for (const e of errors.slice(0, 20)) console.log(`   ${e}`)
      process.exitCode = 1
    } else {
      console.log('✓ Retro Arcade smoke passed with no unexpected errors.')
    }
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  for (const e2 of errors.slice(0, 20)) console.error(`   ${e2}`)
  process.exit(1)
})
