/**
 * QUIZ OR DIE smoke: verifies the editor preview renders (phone + big screen),
 * then runs a real host + two players through the start of the show and screenshots
 * the stage to confirm the title never overlaps the gallery/villain. Run: pnpm dev
 * then `node scripts/qod-smoke.mjs`.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SHOTS = '/tmp/qod-shots'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

const run = async () => {
  const browser = await chromium.launch()

  // ── 1. Editor preview (host + phone) ───────────────────────────────────────
  for (const vp of [{ n: '1440', w: 1440, h: 900 }, { n: '390', w: 390, h: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(`${BASE}/editor/quiz-or-die`, { waitUntil: 'networkidle' })
    await sleep(900)
    const over = await overflow(page)
    const text = await page.evaluate(() => document.body.innerText)
    const hasPhone = /Quiz or Die|buzzer|Red Sea/i.test(text)
    await page.screenshot({ path: `${SHOTS}/editor-${vp.n}.png`, fullPage: false })
    log(`editor @${vp.n}: overflow=${over}px previewText=${hasPhone ? 'present' : 'MISSING'} consoleErrors=${errors.length}`)
    if (errors.length) log('   errors:', errors.slice(0, 3))
    await ctx.close()
  }

  // ── 2. Real host + two players ─────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } })
  const host = await ctx.newPage()
  const hostErrors = []
  host.on('console', (m) => m.type() === 'error' && hostErrors.push(m.text()))
  host.on('pageerror', (e) => hostErrors.push('PAGEERROR ' + e.message))
  await host.goto(`${BASE}/host/quiz-or-die`, { waitUntil: 'networkidle' })
  await sleep(2500)
  // room code from the stage bar
  const code = (await host.locator('.code').first().innerText().catch(() => '')).trim()
  log(`host room code: "${code}"`)
  await host.screenshot({ path: `${SHOTS}/host-lobby.png` })
  if (!code || code.length !== 4) {
    log('could not read a room code; aborting show smoke')
    await browser.close()
    return
  }

  // join two players
  const players = []
  for (const name of ['Damien', 'Regan']) {
    const p = await ctx.newPage()
    p.on('pageerror', (e) => log(`[${name}] PAGEERROR`, e.message))
    await p.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
    await sleep(900)
    await p.getByLabel(/display name/i).fill(name).catch(() => {})
    await sleep(150)
    await p.getByRole('button', { name: /join game/i }).first().click().catch(() => {})
    await sleep(1600)
    players.push({ name, page: p })
    log(`joined ${name}`)
  }
  await sleep(1500)
  const lobbyCount = await host.locator('.gp, .chip').count()
  log(`host sees roster elements: ${lobbyCount}`)
  await host.screenshot({ path: `${SHOTS}/host-lobby-2players.png` })

  // fewer questions so the smoke reaches the finale + ending
  await host.locator('.round-opt', { hasText: /^3$/ }).first().click().catch(() => {})
  await sleep(400)
  // start the show
  const startBtn = host.getByRole('button', { name: /enter the house/i }).first()
  const startable = await startBtn.isEnabled().catch(() => false)
  log(`start button enabled: ${startable}`)
  if (startable) {
    await startBtn.click()
    // walk through the whole show, answering / locking in on phones
    for (let t = 0; t < 100; t++) {
      await sleep(2000)
      // each player taps the first answer option if one is showing
      for (const pl of players) {
        const opt = pl.page.locator('.opt:not(:disabled), .cup-btn:not(:disabled), button.btn-primary:not(:disabled)').first()
        if (await opt.count()) await opt.click().catch(() => {})
      }
      const info = await host.evaluate(() => ({
        marquee: (document.querySelector('.qod-marquee')?.textContent || '').trim(),
        finale: !!document.querySelector('.lane'),
        ending: (document.querySelector('.ending')?.textContent || '').trim(),
      }))
      if (t % 2 === 0 || info.finale || info.ending) {
        await host.screenshot({ path: `${SHOTS}/host-show-${String(t).padStart(2, '0')}.png` })
        log(`  t=${t} marquee="${info.marquee}"${info.finale ? ' [FINALE]' : ''}${info.ending ? ' ENDING="' + info.ending.slice(0, 40) + '"' : ''}`)
      }
      if (info.ending) break
    }
    await host.screenshot({ path: `${SHOTS}/host-show-final.png` })
  }
  log(`host console/page errors: ${hostErrors.length}`)
  if (hostErrors.length) log('   ', hostErrors.slice(0, 5))
  await browser.close()
}

run().catch((e) => {
  console.error('smoke failed:', e)
  process.exit(1)
})
