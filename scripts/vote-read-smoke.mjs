/**
 * Crowded-vote readability smoke: a 5-player Mad Libs (fill -> vote) room where
 * everyone submits a LONG fill, then the judge round must (1) scale its vote
 * window to the gallery (the read-time scaling: the countdown opens well above
 * the base 30s), (2) lay the big-screen gallery out dense (two columns) so it
 * all fits, and (3) keep 0 horizontal overflow on the host at 1440px and a
 * phone at 390px. Run: `pnpm dev`, then
 * `BASE_URL=http://localhost:<port> node scripts/vote-read-smoke.mjs`.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)
const NAMES = ['Ada', 'Bee', 'Cyd', 'Dot', 'Eve']
// 26 chars: blanks cap at 30, so every blank lands near max length.
const LONG = 'absolutelygiganticpurpleox'

async function joinPlayer(browser, code, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => log(`[${name}] PAGEERROR`, e.message))
  await p.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
  await sleep(600)
  await p.getByLabel(/display name/i).fill(name).catch(() => {})
  await sleep(120)
  await p.getByRole('button', { name: /join game/i }).first().click().catch(() => {})
  await sleep(1200)
  return p
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

const run = async () => {
  const browser = await chromium.launch()
  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const host = await hostCtx.newPage()
  const hostErr = []
  host.on('console', (m) => m.type() === 'error' && hostErr.push(m.text()))
  host.on('pageerror', (e) => hostErr.push(`PAGEERROR ${e.message}`))

  log('• Host opens Mad Libs (1440px)')
  await host.goto(`${BASE}/host/mad-libs`, { waitUntil: 'networkidle' })
  await sleep(2200)
  const code = (await host.locator('.code').first().innerText().catch(() => '')).trim()
  if (!code || code.length !== 4) throw new Error('no room code')
  log(`  ✓ room code = ${code}`)

  const phones = []
  for (const n of NAMES) phones.push(await joinPlayer(browser, code, n))
  log(`  ✓ ${NAMES.length} phones joined (390px)`)

  await host.getByRole('button', { name: /start game/i }).first().click().catch(() => {})
  await sleep(1500)

  // Round 0 (fill): every phone fills each blank with a near-max-length token.
  const submitted = new Set()
  let voteOpenSeconds = 0
  let sawDense = false
  for (let t = 0; t < 40; t++) {
    for (let i = 0; i < phones.length; i++) {
      if (submitted.has(i)) continue
      const p = phones[i]
      if (await p.getByRole('button', { name: /lock it in/i }).count()) {
        const inputs = p.locator('.player input[type="text"], .player textarea')
        const n = await inputs.count()
        for (let k = 0; k < n; k++) await inputs.nth(k).fill(LONG).catch(() => {})
        await p.getByRole('button', { name: /lock it in/i }).first().click().catch(() => {})
        submitted.add(i)
        log(`  ✓ ${NAMES[i]} submitted a long fill`)
      }
    }
    // Drive the host's primary action toward / through the vote round.
    const btn = host
      .locator('button')
      .filter({ hasText: /collect|open|lock answers|start the vote|begin voting|voting|next/i })
      .first()
    if (await btn.count()) await btn.click().catch(() => {})
    await sleep(1100)

    // The judge round is up when the host shows the vote gallery.
    if (await host.locator('.vote-host .rows').count()) {
      sawDense = (await host.locator('.vote-host .rows.dense').count()) > 0
      const ring = await host.locator('.cd .inner').first().innerText().catch(() => '')
      voteOpenSeconds = Math.max(voteOpenSeconds, Number.parseInt(ring, 10) || 0)
      if (voteOpenSeconds > 0 && sawDense) break
    }
  }

  log('• Judge round: read-time scaling + dense gallery')
  if (submitted.size !== NAMES.length) throw new Error(`only ${submitted.size}/${NAMES.length} fills submitted`)
  // Base vote timer is 30s; five near-max mad-libs stories must stretch it well past that.
  if (voteOpenSeconds <= 35) throw new Error(`vote window not scaled (countdown opened at ${voteOpenSeconds}s)`)
  log(`  ✓ vote countdown opened at ${voteOpenSeconds}s (> base 30s: scaled to the gallery)`)
  if (!sawDense) throw new Error('host gallery did not switch to the dense two-column layout')
  const cols = await host
    .locator('.vote-host .rows.dense')
    .first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  if (cols !== 2) throw new Error(`dense gallery has ${cols} columns, expected 2`)
  log('  ✓ host gallery is dense (2 columns)')

  log('• Overflow checks')
  if (!(await noHorizontalOverflow(host))) throw new Error('host 1440px: horizontal overflow')
  log('  ✓ host 1440px: no horizontal overflow')
  if (!(await noHorizontalOverflow(phones[0]))) throw new Error('phone 390px: horizontal overflow')
  log('  ✓ phone 390px: no horizontal overflow')

  if (hostErr.length) throw new Error(`host console/page errors: ${hostErr.slice(0, 3).join(' | ')}`)
  log('\n✓ Vote readability smoke passed with no console/page errors.')
  await browser.close()
}

run().catch((e) => {
  console.error('smoke failed:', e.message ?? e)
  process.exit(1)
})
