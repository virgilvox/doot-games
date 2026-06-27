/**
 * Real-browser check for the image-layout fixes (host big screen):
 *  - a contain image HUGS the picture (the bordered frame ratio == the image's
 *    natural ratio, so no letterbox gap) and FILLS the space (it is large);
 *  - the ControlBar is never pushed below the fold by the standings peek;
 *  - 0 horizontal overflow at 1440x900.
 * Drives a `custom` draft (slide + poll + guess) via the editor->host draft in
 * sessionStorage. Run with the dev server up:
 *   pnpm dev   # one shell
 *   node scripts/image-layout-smoke.mjs
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SHOTS = '/private/tmp/claude-501/-Users-obsidian-Projects-ossuary-projects-doot-games/407e69d6-46e5-4fa0-a244-a9c33dd7cb8d/scratchpad/imgshots'
mkdirSync(SHOTS, { recursive: true })
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

// Distinct, intrinsically-sized SVGs so letterboxing is obvious: the colored
// rect fills the whole intrinsic box, so if the bordered frame shows ANY
// background band the frame is bigger than the picture (a gap).
const svg = (w, h, color, label) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
      `<rect width='${w}' height='${h}' fill='${color}'/>` +
      `<text x='50%' y='50%' font-family='sans-serif' font-size='${Math.round(Math.min(w, h) / 8)}' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text>` +
      `</svg>`,
  )}`
const LANDSCAPE = svg(1200, 600, '%23116a7b', '2:1')
const PORTRAIT = svg(600, 1000, '%237a3b8f', '3:5')
const SQUARE = svg(800, 800, '%23b5651d', '1:1')

const DRAFT = {
  pluginId: 'custom',
  config: {
    title: 'Image Layout Check',
    rounds: [
      { block: 'slide', content: { heading: 'Red Thread Quest', body: 'Two idiots kiss because an app on their phone tells them to.', image: PORTRAIT, layout: 'side' } },
      { block: 'slide', content: { heading: 'Yaoi Butt', body: 'sdjnflsdjfnsdlkfnsdlkfnsdlkfndslkfn', image: LANDSCAPE, layout: 'side' } },
      { block: 'poll', content: { prompt: 'Have you read Roses and Champagne?', image: PORTRAIT, timer: 0, options: [{ label: 'Yes' }, { label: 'No' }, { label: "I started but haven't finished" }] } },
      { block: 'poll', content: { prompt: 'Have you read Red Thread Quest?', image: SQUARE, timer: 0, options: [{ label: 'Yes' }, { label: 'No' }, { label: "I started but haven't finished" }] } },
      { block: 'guess', content: { prompt: 'Who drew this?', image: LANDSCAPE, timer: 0, options: [{ label: 'Artist A' }, { label: 'Artist B' }, { label: 'Artist C' }], correct: 1, revealImage: SQUARE, showLetters: true } },
    ],
    settings: { autoAdvance: false },
  },
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
  const v = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)
  if (v > 4) throw new Error(`${label}: ${v}px VERTICAL overflow (does not fit the screen)`)
}

// The contain frame must hug the picture: the rendered <img> aspect ratio equals
// the image's natural ratio (within 2%), proving no letterbox band in the frame.
async function assertHugs(page, label, minH = 300) {
  const r = await page.evaluate(() => {
    const img = document.querySelector('.media-frame.is-contain img')
    if (!img) return null
    return { cw: img.clientWidth, ch: img.clientHeight, nw: img.naturalWidth, nh: img.naturalHeight }
  })
  if (!r) throw new Error(`${label}: no contain image found`)
  const rendered = r.cw / r.ch
  const natural = r.nw / r.nh
  const drift = Math.abs(rendered - natural) / natural
  if (drift > 0.02) throw new Error(`${label}: frame ratio ${rendered.toFixed(3)} != image ${natural.toFixed(3)} (letterbox gap)`)
  if (minH > 0 && r.ch < minH) throw new Error(`${label}: image too small (h=${r.ch}px) - not filling`)
  ok(`${label}: hugs (drift ${(drift * 100).toFixed(1)}%)${minH > 0 ? ` + fills (h=${r.ch}px)` : ''}`)
}

// Click through whatever advance state this round is in until it reaches the
// next round. (Untimed rounds auto-open, so "Open voting" may be absent.)
async function advanceToNextRound(host) {
  const labels = ['Open voting', 'Lock voting', 'Reveal', 'Next round', 'Start the vote', 'Collect answers', 'Lock answers']
  for (let i = 0; i < 8; i++) {
    let clicked = false
    for (const t of labels) {
      const loc = host.locator(`button:has-text("${t}")`)
      if (await loc.count()) {
        await loc.first().click()
        clicked = true
        if (t === 'Next round') return
        break
      }
    }
    await host.waitForTimeout(clicked ? 250 : 400)
  }
  throw new Error('advanceToNextRound: never reached Next round')
}

async function run() {
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript((d) => {
      try { sessionStorage.setItem('doot-game-draft', JSON.stringify(d)) } catch {}
    }, DRAFT)
    const host = await ctx.newPage()

    step('Host the custom draft')
    await host.goto(`${BASE}/host/custom`)
    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })

    // Join a phone in the LOBBY (so it's eligible for every round, incl. the final
    // scored guess whose reveal publishes the standings we test the bar against).
    const code = (await host.textContent('.code'))?.trim()
    const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.locator('input').last().fill('Ana')
    await p.click('button:has-text("Join")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    await host.bringToFront()

    await host.click('button:has-text("Start game")')

    // Round 1: slide, portrait, side
    await host.waitForSelector('.slide.side .media-frame', { timeout: 40000 })
    await host.waitForTimeout(400)
    await assertHugs(host, 'slide portrait (side)')
    await noOverflow(host, 'slide portrait')
    await host.screenshot({ path: `${SHOTS}/1-slide-portrait.png` })
    await host.click('button:has-text("Next")')

    // Round 2: slide, landscape, side
    await host.waitForSelector('.slide.side .media-frame', { timeout: 40000 })
    await host.waitForTimeout(400)
    await assertHugs(host, 'slide landscape (side)')
    await noOverflow(host, 'slide landscape')
    await host.screenshot({ path: `${SHOTS}/2-slide-landscape.png` })
    await host.click('button:has-text("Next")')

    // Round 3: poll, portrait
    await host.waitForSelector('.stage-grid .media-frame', { timeout: 40000 })
    await host.waitForTimeout(400)
    await assertHugs(host, 'poll portrait')
    await noOverflow(host, 'poll portrait')
    await host.screenshot({ path: `${SHOTS}/3-poll-portrait.png` })
    await advanceToNextRound(host)

    // Round 4: poll, square
    await host.waitForSelector('.stage-grid .media-frame', { timeout: 40000 })
    await host.waitForTimeout(400)
    await assertHugs(host, 'poll square')
    await noOverflow(host, 'poll square')
    await host.screenshot({ path: `${SHOTS}/4-poll-square.png` })
    await advanceToNextRound(host)

    // Round 5: guess. The lobby-joined phone answers -> a scored reveal publishes
    // standings; confirm the bar stays on-screen.
    step('Answer the guess, reveal -> standings must not push the bar off-screen')
    await host.waitForSelector('.stage-grid', { timeout: 40000 })
    const openBtn = host.locator('button:has-text("Open voting")')
    if (await openBtn.count()) await openBtn.click() // untimed rounds auto-open
    await p.bringToFront()
    await p.waitForSelector('.opt', { timeout: 40000 })
    await p.waitForTimeout(500)
    const phoneImg = p.locator('.media-frame.is-contain img')
    if (await phoneImg.count()) await assertHugs(p, 'phone prompt image', 0)
    else console.log('  ! phone prompt image not present (showImage false?) - see screenshot')
    await p.screenshot({ path: `${SHOTS}/6-phone-guess.png` })
    await p.locator('.opt').nth(1).click() // the correct answer -> a positive score on the board
    const lockBtn = p.locator('button:has-text("Lock it in")')
    if (await lockBtn.count()) await lockBtn.click({ timeout: 5000 }).catch(() => {})
    await host.bringToFront()
    // The round may auto-lock once the lone eligible player answers, so click Lock
    // only if it's still there, then reveal.
    const lockV = host.locator('button:has-text("Lock voting")')
    if (await lockV.count()) await lockV.click().catch(() => {})
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')

    await host.waitForSelector('.host-standings', { timeout: 40000 })
    await host.waitForTimeout(500)
    // The bar (and its Next/Final button) must be fully within the 900px viewport.
    const bar = await host.evaluate(() => {
      const el = document.querySelector('.stage-controlbar')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight }
    })
    if (!bar) throw new Error('reveal: no control bar')
    if (bar.bottom > bar.vh + 1) throw new Error(`reveal: control bar bottom ${Math.round(bar.bottom)} > viewport ${bar.vh} (pushed off-screen)`)
    ok(`reveal: control bar pinned in view (bottom=${Math.round(bar.bottom)} <= ${bar.vh})`)
    await noOverflow(host, 'guess reveal')
    await host.screenshot({ path: `${SHOTS}/5-guess-reveal-standings.png` })

    console.log(`\nPASS: image-layout-smoke  (shots in ${SHOTS})`)
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
