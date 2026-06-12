/**
 * Visual capture of the Retro Arcade redesign for manual QA:
 *  - host with the screen small (QR beside it) and large (QR wraps below)
 *  - the phone controller in landscape (full-screen gamepad, no overflow)
 *  - the spectator stream view via /watch/<code>
 * Run: pnpm dev, then node scripts/arcade-shots.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ROM = 'https://example.com/demo.nes'
const out = '/tmp'

async function joinForm(page, name) {
  await page.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await page.fill('input[placeholder="e.g. Robin"]', name)
  await page.click('button:has-text("Join game")')
  const recon = page.locator('button:has-text("reconnect")')
  try {
    await recon.waitFor({ state: 'visible', timeout: 2500 })
    await recon.click()
  } catch {}
}

const browser = await chromium.launch()
try {
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await host.goto(`${BASE}/host/retro-arcade`)
  await host.waitForSelector('.big-code', { timeout: 60000 })
  const code = (await host.textContent('.big-code')).trim()
  await host.fill('input[type="text"]', ROM)
  await host.waitForSelector('.detected', { timeout: 10000 })
  await host.click('button:has-text("Boot & open room")')
  await host.waitForSelector('#arcade-screen', { timeout: 60000 })
  await host.waitForTimeout(800)
  await host.screenshot({ path: `${out}/arcade-host-default.png` })
  console.log('host default (screen + QR beside)')

  // Grow the screen by dragging the resize handle far right.
  const h = await host.locator('.resize-h').boundingBox()
  await host.mouse.move(h.x + 13, h.y + 13)
  await host.mouse.down()
  await host.mouse.move(1380, h.y + 360, { steps: 10 })
  await host.mouse.up()
  await host.waitForTimeout(400)
  await host.screenshot({ path: `${out}/arcade-host-large.png` })
  console.log('host large (QR wraps below)')

  // Phone controller, landscape.
  const phone = await (
    await browser.newContext({ viewport: { width: 780, height: 390 } })
  ).newPage()
  await phone.goto(`${BASE}/play/${code}`)
  await joinForm(phone, 'Ada')
  await phone.waitForSelector('.dpad', { timeout: 60000 })
  await phone.waitForTimeout(600)
  await phone.screenshot({ path: `${out}/arcade-pad-landscape.png` })
  console.log('controller landscape')

  // Phone controller, portrait (should still fit).
  const phoneP = await (
    await browser.newContext({ viewport: { width: 390, height: 780 } })
  ).newPage()
  await phoneP.goto(`${BASE}/play/${code}`)
  await joinForm(phoneP, 'Boo')
  await phoneP.waitForSelector('.dpad', { timeout: 60000 })
  await phoneP.waitForTimeout(600)
  await phoneP.screenshot({ path: `${out}/arcade-pad-portrait.png` })
  console.log('controller portrait')

  // Watch path: open the room and just watch -> stream view.
  const watch = await (
    await browser.newContext({ viewport: { width: 1000, height: 720 } })
  ).newPage()
  await watch.goto(`${BASE}/watch/${code}`)
  await watch.waitForTimeout(2500)
  await watch.screenshot({ path: `${out}/arcade-watch.png` })
  console.log('watch view')

  console.log('done ->', out)
} finally {
  await browser.close()
}
