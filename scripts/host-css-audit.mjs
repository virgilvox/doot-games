/**
 * Host-view CSS / responsiveness sweep. For every game, loads the host page at
 * several big-screen viewports, measures horizontal overflow (the 0-overflow
 * requirement), names the widest offending elements, and saves a screenshot of the
 * lobby + the active stage for visual review. Custom-flow games get phones joined
 * first so their real active view renders. Run:  pnpm dev  then  node scripts/host-css-audit.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const OUT = '/tmp/css-audit'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '1920', w: 1920, h: 1080 },
  { name: '1366', w: 1366, h: 768 },
  { name: '1280', w: 1280, h: 800 },
]
const GAMES = [
  'guess', 'rate', 'poll', 'rank', 'draw', 'votebox', 'quip-clash', 'mad-libs',
  'split-room', 'fib-finder', 'sketch-spot', 'circuit-cypher', 'what-you-didnt-know',
  'backronym', 'open-mic', 'hivemind', 'most-likely', 'ballpark', 'faker',
  'truth-or-share', 'custom',
]
const CUSTOM_FLOW = new Set(['circuit-cypher', 'open-mic', 'truth-or-share'])
const findings = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width > 1 && r.right > vw + 1.5) {
        offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 48), right: Math.round(r.right) })
      }
    }
    offenders.sort((a, b) => b.right - a.right)
    // de-dup by class+tag
    const seen = new Set()
    const uniq = []
    for (const o of offenders) { const k = o.tag + o.cls; if (!seen.has(k)) { seen.add(k); uniq.push(o) } }
    return { scrollW: document.documentElement.scrollWidth, clientW: vw, over: document.documentElement.scrollWidth - vw, offenders: uniq.slice(0, 6) }
  })
}

async function check(page, slug, state, vp) {
  const o = await overflow(page)
  const tag = `${slug} @${vp.name} [${state}]`
  if (o.over > 1) {
    findings.push(`${tag}: OVERFLOW +${o.over}px -> ${o.offenders.map((f) => `${f.tag}.${f.cls}(${f.right})`).join(', ')}`)
    console.log(`  ✗ ${tag}: +${o.over}px`)
  } else {
    console.log(`  ✓ ${tag}`)
  }
}

async function joinPhone(browser, code, name) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
  await p.goto(`${BASE}/play/${code}`)
  await p.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await p.fill('input[placeholder="e.g. Robin"]', name)
  await p.click('button:has-text("Join game")')
  return p
}

const browser = await chromium.launch()
for (const slug of GAMES) {
  console.log(`\n• ${slug}`)
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const host = await ctx.newPage()
  const errs = []
  host.on('pageerror', (e) => errs.push(e.message))
  try {
    await host.goto(`${BASE}/host/${slug}`, { timeout: 60000 })
    await host.waitForSelector('button:has-text("Start"), .big-code', { timeout: 60000 })
    // Lobby at each viewport.
    for (const vp of VIEWPORTS) { await host.setViewportSize({ width: vp.w, height: vp.h }); await sleep(250); await check(host, slug, 'lobby', vp) }
    await host.setViewportSize({ width: 1920, height: 1080 })
    await host.screenshot({ path: `${OUT}/${slug}-lobby.png` })

    // Phones for custom-flow (so the real active view renders).
    let phones = []
    let code = ''
    try { code = (await host.textContent('.big-code')).trim() } catch {}
    if (CUSTOM_FLOW.has(slug) && code) {
      for (const n of ['Aa', 'Bb', 'Cc']) phones.push(await joinPhone(browser, code, n))
      // wait for the host to see them
      for (let i = 0; i < 30; i++) { const t = (await host.locator('.count').first().textContent().catch(() => '')) || ''; if (t.includes('3 joined')) break; await sleep(500) }
    }

    // Start + advance into the active stage. Wait for the Start button to be
    // ENABLED first (it is disabled until the room connects + the config loads).
    await host.waitForSelector('button:has-text("Start"):not([disabled])', { timeout: 60000 }).catch(() => {})
    const startBtn = host.locator('button', { hasText: /^Start/ }).first()
    if (await startBtn.count()) await startBtn.click().catch(() => {})
    await host.waitForSelector('.lobby', { state: 'detached', timeout: 15000 }).catch(() => {})
    await sleep(2000)
    // Try to open the round (block games sit at "ready" until opened).
    for (const label of ['Collect answers', 'Open the mic', 'Open voting']) {
      const b = host.locator(`button:has-text("${label}")`)
      if (await b.count()) { await b.click().catch(() => {}); break }
    }
    await sleep(2000)
    for (const vp of VIEWPORTS) { await host.setViewportSize({ width: vp.w, height: vp.h }); await sleep(300); await check(host, slug, 'active', vp) }
    await host.setViewportSize({ width: 1920, height: 1080 })
    await sleep(300)
    await host.screenshot({ path: `${OUT}/${slug}-active.png` })

    for (const p of phones) await p.close().catch(() => {})
  } catch (e) {
    findings.push(`${slug}: THREW ${e.message.split('\n')[0]}`)
    console.log(`  ✗ ${slug}: threw ${e.message.split('\n')[0]}`)
  }
  if (errs.length) findings.push(`${slug}: pageerror ${errs[0]}`)
  await ctx.close()
}
await browser.close()

console.log(`\n=== ${findings.length} finding(s) ===`)
for (const f of findings) console.log(`  - ${f}`)
console.log(`screenshots in ${OUT}`)
