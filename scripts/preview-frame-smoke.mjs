/**
 * Verifies the editor preview <iframe> (PreviewFrame): the phone/host previews now
 * render inside a real iframe whose OWN viewport equals the device width, so block
 * `vw` fonts resolve to the device (390 / 1280), not the editor window. A vw unit is
 * by definition 1% of the viewport, and the iframe's viewport IS its innerWidth, so
 * innerWidth === 390/1280 proves vw fidelity. Also confirms the teleported content +
 * theme render inside the frame, screenshots both, and checks for overflow.
 * Run: pnpm dev then node scripts/preview-frame-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const OUT = process.env.OUT_DIR || '/tmp'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails.push(msg) }

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const consoleIssues = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => consoleIssues.push(`[pageerror] ${e.message}`))
  await page.goto(`${BASE}/editor/custom`, { waitUntil: 'networkidle' })
  await sleep(800)

  // --- PHONE preview (default mode) ---
  const phoneFrameEl = await page.locator('.ed-phone-screen iframe').first()
  await phoneFrameEl.waitFor({ state: 'attached', timeout: 5000 })
  const phoneFrame = page.frameLocator('.ed-phone-screen iframe').first()
  // The teleported content lands in #doot-root inside the frame.
  await phoneFrame.locator('#doot-root .ed-phone').first().waitFor({ timeout: 5000 })
  ok(true, 'phone: teleported content rendered inside the iframe (#doot-root .ed-phone)')

  // Exactly one #doot-root / .ed-phone: the srcdoc load race must not leave an orphan
  // mounted into a discarded transient document.
  const rootCount = await phoneFrameEl.evaluate((f) => f.contentDocument.querySelectorAll('#doot-root').length)
  ok(rootCount === 1, `phone: exactly one #doot-root, no orphan from the load race (got ${rootCount})`)

  // Interactivity round-trips through the teleport-in-iframe: a click inside the frame
  // must flow modelValue back to the PARENT Vue tree and re-render a selected option.
  const before = await phoneFrame.locator('.opt[aria-pressed="true"]').count()
  await phoneFrame.locator('.opt').first().click()
  await sleep(250)
  const after = await phoneFrame.locator('.opt[aria-pressed="true"]').count()
  ok(before === 0 && after === 1, `phone: clicking an option round-trips modelValue through the teleport (pressed ${before} -> ${after})`)

  const phoneInfo = await phoneFrameEl.evaluate((el) => {
    const win = el.contentWindow
    const doc = el.contentDocument
    const surface = getComputedStyle(doc.documentElement).getPropertyValue('--surface').trim()
    const theme = doc.documentElement.getAttribute('data-theme')
    return { innerWidth: win.innerWidth, surface, theme, topWidth: window.top.innerWidth }
  })
  ok(phoneInfo.innerWidth === 390, `phone: iframe viewport innerWidth === 390 (got ${phoneInfo.innerWidth}); vw resolves to the device, not the editor window (${phoneInfo.topWidth})`)
  ok(!!phoneInfo.surface, `phone: theme var --surface applied inside the frame (${phoneInfo.surface || 'EMPTY'})`)
  ok(!!phoneInfo.theme, `phone: data-theme set on the frame html (${phoneInfo.theme})`)
  await page.locator('.ed-phone-device').screenshot({ path: `${OUT}/preview-phone.png` })

  // --- HOST (big screen) preview ---
  await page.getByRole('button', { name: 'Big screen' }).click()
  await sleep(600)
  const hostFrameEl = await page.locator('.ed-screen-device iframe').first()
  await hostFrameEl.waitFor({ state: 'attached', timeout: 5000 })
  const hostFrame = page.frameLocator('.ed-screen-device iframe').first()
  await hostFrame.locator('#doot-root .ed-screen-stage').first().waitFor({ timeout: 5000 })
  ok(true, 'host: teleported stage rendered inside the iframe (#doot-root .ed-screen-stage)')

  const hostInfo = await hostFrameEl.evaluate((el) => ({
    innerWidth: el.contentWindow.innerWidth,
    innerHeight: el.contentWindow.innerHeight,
  }))
  ok(hostInfo.innerWidth === 1280, `host: iframe viewport innerWidth === 1280 (got ${hostInfo.innerWidth})`)
  ok(hostInfo.innerHeight === 720, `host: iframe viewport innerHeight === 720 (got ${hostInfo.innerHeight})`)
  await page.locator('.ed-screen-device').screenshot({ path: `${OUT}/preview-host.png` })

  // --- No horizontal overflow on the editor page ---
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, `editor page: no horizontal overflow (scrollWidth-clientWidth = ${over})`)

  // --- No console errors/warnings across the flow (filter dev noise) ---
  const realIssues = consoleIssues.filter((s) => !/favicon|sourcemap|\[vite\]|hmr|Vue Devtools|net::ERR/i.test(s))
  ok(realIssues.length === 0, `no console errors/warnings (${realIssues.length})`)
  if (realIssues.length) console.log('   - ' + realIssues.join('\n   - '))

  await browser.close()
  console.log(fails.length ? `\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}` : '\nALL GREEN')
  process.exit(fails.length ? 1 : 0)
}
run().catch((e) => { console.error(e); process.exit(2) })
