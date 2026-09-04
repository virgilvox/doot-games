/**
 * Rank board smoke: a picture-led Rank round, end to end.
 *
 * Proves the thing the feedback asked for: the room's #1 leads the results with its
 * picture and EVERY other item is still listed, on the big screen at the reveal, on
 * the phone, and on the final results page. Headless players connect straight to the
 * relay through the real RoomRuntime and cast a ranking; one real phone watches.
 *
 *   pnpm dev   then   node_modules/.bin/jiti scripts/rank-board-smoke.mjs
 *   BASE_URL=http://localhost:3100 HEADLESS=25 SHOTS=1
 */
import { chromium } from 'playwright'
import { createClaspRelay, createRoom } from '@doot-games/engine'

const _log = console.log.bind(console)
console.log = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('CLASP ')) return
  _log(...a)
}

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEADLESS = Number(process.env.HEADLESS ?? 25)
const RELAY = process.env.RELAY_URL || 'wss://relay.clasp.to'
const SHOTS = process.env.SHOTS === '1'
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/doot-rankboard'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const ok = (c, m) => {
  console.log(`  ${c ? '✓' : '✗'} ${m}`)
  if (!c) fails.push(m)
}

// Tiny inline SVG pictures, so the smoke needs no object storage and the shots are
// unmistakable (each item is a different solid colour with its letter on it).
const pic = (bg, letter) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="${bg}"/><text x="120" y="118" font-size="96" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`,
  )}`

const ITEMS = [
  { id: 'tacos', label: 'Tacos', image: pic('#e8590c', 'T') },
  { id: 'pizza', label: 'Pizza', image: pic('#2f9e44', 'P') },
  { id: 'sushi', label: 'Sushi', image: pic('#1971c2', 'S') },
  { id: 'kale', label: 'Kale', image: '' }, // no picture on purpose: it must still list
]
// Everyone ranks Sushi first, so the winner is deterministic.
const BALLOT = ['sushi', 'tacos', 'pizza', 'kale']

async function saveGame() {
  const email = `rankboard_${Date.now()}@doot.dev`
  const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: 'supersecret123', name: 'rankboard' }),
  })
  const cookie = (su.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) throw new Error(`signup gave no cookie (status ${su.status})`)
  const game = {
    pluginId: 'custom',
    themeId: 'doot',
    visibility: 'unlisted',
    config: {
      title: 'Rank Board Smoke',
      rounds: [{ block: 'rank', content: { prompt: 'Rank the snacks', image: '', timer: null, items: ITEMS } }],
    },
  }
  const res = await fetch(`${BASE}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: JSON.stringify(game),
  })
  if (!res.ok) throw new Error(`save failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).id
}

function makeVoter(code, name, relays) {
  const relay = createClaspRelay(RELAY)
  relays.push(relay)
  const p = createRoom({ relay, room: code, role: 'player', name })
  let cast = false
  const off = p.onChange(() => {
    const s = p.getSnapshot()
    if (cast || s.phase !== 'active' || s.round?.state !== 'open') return
    cast = true
    p.submit({ order: BALLOT })
  })
  return { p, off, voted: () => cast }
}

async function shot(page, name) {
  if (!SHOTS) return
  const { mkdirSync } = await import('node:fs')
  mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false })
}

;(async () => {
  const id = await saveGame()
  const browser = await chromium.launch()
  const relays = []
  try {
    const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    const errs = []
    host.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
    await host.goto(`${BASE}/host/g/${id}`)
    await host.waitForSelector('.code', { timeout: 60000 })
    const code = (await host.textContent('.code')).trim()
    console.log(`room ${code}, ${HEADLESS} headless rankers`)

    const voters = []
    for (let i = 0; i < HEADLESS; i += 10) {
      const batch = Array.from({ length: Math.min(10, HEADLESS - i) }, (_, k) =>
        makeVoter(code, `Bot${String(i + k + 1).padStart(3, '0')}`, relays),
      )
      voters.push(...batch)
      await Promise.all(batch.map((v) => v.p.connect().catch((e) => fails.push(`spawn: ${e.message}`))))
      await sleep(300)
    }

    // One real phone, so the phone reveal is exercised for real.
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
    const phoneErrs = []
    phone.on('pageerror', (e) => phoneErrs.push(String(e).slice(0, 200)))
    await phone.goto(`${BASE}/play/${code}`)
    await phone.waitForSelector('input', { timeout: 40000 })
    await phone.fill('input[placeholder="e.g. Robin"]', 'Phone1')
    await phone.click('button:has-text("Join game")')
    await phone.waitForSelector("text=You're in", { timeout: 40000 })
    await sleep(1500)

    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    await host.click('button:has-text("Start game")')
    // Open the round, let the headless ballots land, then lock + reveal.
    for (const label of ['Open', 'Start', 'Begin']) {
      const b = host.locator(`button:has-text("${label}")`).first()
      if (await b.count()) {
        await b.click()
        break
      }
    }
    await sleep(2500)
    await shot(phone, 'phone-ranking')
    const lock = host.locator('button:has-text("Lock")').first()
    if (await lock.count()) await lock.click()
    await sleep(800)
    const reveal = host.locator('button:has-text("Reveal")').first()
    if (await reveal.count()) await reveal.click()
    await sleep(2000)

    // ── The host big screen at the reveal ──
    await shot(host, 'host-reveal')
    const heroText = await host.evaluate(() => document.querySelector('.wb-name')?.textContent?.trim() ?? '')
    const heroPlace = await host.evaluate(() => document.querySelector('.wb-place')?.textContent?.trim() ?? '')
    const heroImg = await host.evaluate(() => !!document.querySelector('.wb-hero img'))
    const restLabels = await host.evaluate(() =>
      [...document.querySelectorAll('.wb-rest .wb-label')].map((n) => n.textContent.trim()),
    )
    const restThumbs = await host.evaluate(() => document.querySelectorAll('.wb-rest img').length)
    console.log(`  host hero: "${heroPlace} ${heroText}" img=${heroImg}; rest=${JSON.stringify(restLabels)} thumbs=${restThumbs}`)
    ok(heroText === 'Sushi', `winner leads the board (got "${heroText}")`)
    ok(heroPlace === '#1', `winner is badged #1 (got "${heroPlace}")`)
    ok(heroImg, 'winner shows its picture')
    ok(
      JSON.stringify(restLabels) === JSON.stringify(['Tacos', 'Pizza', 'Kale']),
      'every other item is listed, in order',
    )
    ok(restThumbs === 2, `picture-bearing runners-up show a thumbnail, the plain one does not (${restThumbs})`)

    // ── The phone reveal ──
    await sleep(500)
    await shot(phone, 'phone-reveal')
    const phoneHero = await phone.evaluate(() => document.querySelector('.wb-name')?.textContent?.trim() ?? '')
    const phoneRest = await phone.evaluate(() => document.querySelectorAll('.wb-rest .wb-row').length)
    ok(phoneHero === 'Sushi', `phone leads with the winner (got "${phoneHero}")`)
    ok(phoneRest === 3, `phone lists the rest of the order (${phoneRest})`)

    // ── The final results page ──
    for (let guard = 0; guard < 6; guard++) {
      const next = host.locator('button:has-text("Final results"), button:has-text("Next round")').first()
      if (!(await next.count())) break
      await next.click()
      await sleep(1200)
    }
    await sleep(1500)
    await shot(host, 'host-results')
    const onResults = await host.locator('.results').count()
    ok(onResults > 0, 'reached the results page')
    // The breakdown page is a podium too; page to it if the carousel opened elsewhere.
    let foundPodium = false
    for (let guard = 0; guard < 6; guard++) {
      if (await host.locator('.results .wb-hero').count()) {
        foundPodium = true
        break
      }
      const nextSection = host.locator('.cside').last()
      if (!(await nextSection.count())) break
      await nextSection.click()
      await sleep(700)
    }
    await shot(host, 'host-results-podium')
    ok(foundPodium, 'the results breakdown renders as a podium, not a plain bar chart')
    if (foundPodium) {
      const rHero = await host.evaluate(() => document.querySelector('.results .wb-name')?.textContent?.trim() ?? '')
      const rRest = await host.evaluate(() => document.querySelectorAll('.results .wb-rest .wb-row').length)
      ok(rHero === 'Sushi', `results podium leads with the winner (got "${rHero}")`)
      ok(rRest === 3, `results podium lists the rest (${rRest})`)
    }

    const overflow = await host.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(overflow === 0, `host has no horizontal overflow (${overflow})`)
    ok(errs.length === 0, `no host page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`)
    ok(phoneErrs.length === 0, `no phone page errors${phoneErrs.length ? `: ${phoneErrs.slice(0, 2).join(' | ')}` : ''}`)
    console.log(`  ballots cast: ${voters.filter((v) => v.voted()).length}/${voters.length}`)
    for (const v of voters) {
      try {
        v.off()
        v.p.dispose()
      } catch {
        /* */
      }
    }
  } finally {
    for (const r of relays)
      try {
        r.close()
      } catch {
        /* */
      }
    await browser.close()
  }
  console.log(fails.length ? `\nFAIL (${fails.length}):\n  - ${fails.join('\n  - ')}` : '\nALL GREEN')
  process.exit(fails.length ? 1 : 0)
})()
