/**
 * Deep host-view CSS audit: drives a representative game per pattern with phones
 * all the way to the layout-heavy states the shallow sweep can't reach, the derived
 * vote boards, the reveal boards, the results carousel, and the custom-flow show
 * views, measuring horizontal overflow and saving screenshots at 1920x1080 (and a
 * 1366 check). Run:  pnpm dev  then  node scripts/host-css-deep.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const OUT = '/tmp/css-audit'
mkdirSync(OUT, { recursive: true })
const findings = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overflow(page, label) {
  for (const w of [1920, 1366]) {
    await page.setViewportSize({ width: w, height: w === 1920 ? 1080 : 768 })
    await sleep(250)
    const o = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const off = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width > 1 && r.right > vw + 1.5) off.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').slice(0, 40)}`)
      }
      return { over: document.documentElement.scrollWidth - vw, off: [...new Set(off)].slice(0, 5) }
    })
    if (o.over > 1) { findings.push(`${label} @${w}: +${o.over}px -> ${o.off.join(', ')}`); console.log(`  ✗ ${label} @${w}: +${o.over}px ${o.off.join(', ')}`) }
    else console.log(`  ✓ ${label} @${w}`)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
}
async function shot(page, name) { await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(300); await page.screenshot({ path: `${OUT}/deep-${name}.png` }) }

async function host(browser, slug) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${BASE}/host/${slug}`, { timeout: 60000 })
  await p.waitForSelector('.big-code', { timeout: 60000 })
  const code = (await p.textContent('.big-code')).trim()
  return { ctx, host: p, code, errs }
}
async function join(browser, code, name) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage()
  await p.goto(`${BASE}/play/${code}`)
  await p.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await p.fill('input[placeholder="e.g. Robin"]', name)
  await p.click('button:has-text("Join game")')
  return p
}
async function waitRoster(h, n) { for (let i = 0; i < 40; i++) { const t = (await h.locator('.count').first().textContent().catch(() => '')) || ''; if (t.includes(`${n} joined`)) return; await sleep(500) } }
async function clickAny(p, labels) { for (const l of labels) { const b = p.locator(`button:has-text("${l}")`); if (await b.count() && await b.first().isEnabled().catch(() => false)) { await b.first().click().catch(() => {}); return l } } return null }

const browser = await chromium.launch()

// 1) VoteBox (guess + rate): real boards + reveal + results.
try {
  console.log('\n• votebox (guess board, rate board, reveals, results)')
  const { ctx, host: h, code, errs } = await host(browser, 'votebox')
  const ph = [await join(browser, code, 'Al'), await join(browser, code, 'Bea')]
  await waitRoster(h, 2)
  await h.click('button:has-text("Start game")')
  await sleep(1500)
  await clickAny(h, ['Open voting'])
  await sleep(1000)
  await overflow(h, 'votebox guess-open'); await shot(h, 'votebox-guess')
  for (const p of ph) { const o = p.locator('.opt, button').first(); if (await o.count()) await o.click().catch(() => {}); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Reveal'])
  await sleep(1000)
  await overflow(h, 'votebox guess-reveal'); await shot(h, 'votebox-guess-reveal')
  await clickAny(h, ['Next round'])
  await sleep(1200)
  await clickAny(h, ['Open voting'])
  await sleep(800)
  await overflow(h, 'votebox rate-open'); await shot(h, 'votebox-rate')
  for (const p of ph) { const o = p.locator('button').first(); if (await o.count()) await o.click().catch(() => {}); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Reveal'])
  await sleep(800)
  await clickAny(h, ['Final results'])
  await sleep(1500)
  await overflow(h, 'votebox results'); await shot(h, 'votebox-results')
  if (errs.length) findings.push(`votebox pageerror: ${errs[0]}`)
  for (const p of ph) await p.close()
  await ctx.close()
} catch (e) { findings.push(`votebox: ${e.message.split('\n')[0]}`); console.log(`  ✗ votebox threw: ${e.message.split('\n')[0]}`) }

// 2) Quip Clash: derived VOTE board + results.
try {
  console.log('\n• quip-clash (derived vote board, results)')
  const { ctx, host: h, code, errs } = await host(browser, 'quip-clash')
  const ph = [await join(browser, code, 'Al'), await join(browser, code, 'Bea'), await join(browser, code, 'Cy')]
  await waitRoster(h, 3)
  await h.click('button:has-text("Start game")')
  await sleep(1500)
  await clickAny(h, ['Collect answers'])
  await sleep(1000)
  for (const p of ph) { const t = p.locator('textarea'); if (await t.count()) await t.fill('a gloriously long and rambling answer that tests wrapping on the big vote board'); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Start the vote'])
  await sleep(1500)
  await clickAny(h, ['Open voting'])
  await sleep(1200)
  await overflow(h, 'quip vote-board'); await shot(h, 'quip-vote')
  for (const p of ph) { const o = p.locator('button, .opt').first(); if (await o.count()) await o.click().catch(() => {}); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Reveal'])
  await sleep(1000)
  await overflow(h, 'quip vote-reveal'); await shot(h, 'quip-reveal')
  await clickAny(h, ['Final results'])
  await sleep(1500)
  await overflow(h, 'quip results'); await shot(h, 'quip-results')
  if (errs.length) findings.push(`quip-clash pageerror: ${errs[0]}`)
  for (const p of ph) await p.close()
  await ctx.close()
} catch (e) { findings.push(`quip-clash: ${e.message.split('\n')[0]}`); console.log(`  ✗ quip threw: ${e.message.split('\n')[0]}`) }

// 3) Faker: accuse board + reveal + results.
try {
  console.log('\n• faker (accuse board, unmask, results)')
  const { ctx, host: h, code, errs } = await host(browser, 'faker')
  const ph = [await join(browser, code, 'Al'), await join(browser, code, 'Bea'), await join(browser, code, 'Cy')]
  await waitRoster(h, 3)
  await h.click('button:has-text("Start game")')
  await sleep(1200)
  await clickAny(h, ['Collect answers'])
  await sleep(1000)
  for (const p of ph) { const t = p.locator('#faker-clue'); if (await t.count()) await t.fill('clueword'); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Start the vote'])
  await sleep(1200)
  await clickAny(h, ['Open voting'])
  await sleep(1200)
  await overflow(h, 'faker accuse-board'); await shot(h, 'faker-accuse')
  for (const p of ph) { const o = p.locator('.clue:not([disabled])').first(); if (await o.count()) await o.click().catch(() => {}); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Reveal'])
  await sleep(1000)
  await overflow(h, 'faker unmask'); await shot(h, 'faker-unmask')
  if (errs.length) findings.push(`faker pageerror: ${errs[0]}`)
  for (const p of ph) await p.close()
  await ctx.close()
} catch (e) { findings.push(`faker: ${e.message.split('\n')[0]}`); console.log(`  ✗ faker threw: ${e.message.split('\n')[0]}`) }

// 4) Open Mic: the comedy club show (performing) + vote + reveal.
try {
  console.log('\n• open-mic (comedy club show, vote, reveal)')
  const { ctx, host: h, code, errs } = await host(browser, 'open-mic')
  const ph = [await join(browser, code, 'Al'), await join(browser, code, 'Bea'), await join(browser, code, 'Cy')]
  await waitRoster(h, 3)
  await h.click('button:has-text("Start the show")')
  await sleep(1200)
  await clickAny(h, ['Open the mic'])
  await sleep(1000)
  for (const p of ph) { const t = p.locator('textarea'); if (await t.count()) await t.fill('I asked my smart speaker to tell a joke and it filed for divorce'); await clickAny(p, ['Lock it in']) }
  await sleep(1500)
  await clickAny(h, ['Close the mic'])
  await clickAny(h, ['Start the set'])
  await h.waitForSelector('.comedy-stage canvas', { timeout: 60000 })
  await sleep(1500)
  await overflow(h, 'openmic club-show'); await shot(h, 'openmic-show')
  for (let i = 0; i < 12; i++) { if (await h.locator('button:has-text("Reveal the funniest")').count()) break; const s = h.locator('button[aria-label="Skip"]'); if (await s.count()) await s.click().catch(() => {}); await sleep(800) }
  await overflow(h, 'openmic vote'); await shot(h, 'openmic-vote')
  await clickAny(h, ['Reveal the funniest'])
  await sleep(1200)
  await overflow(h, 'openmic reveal'); await shot(h, 'openmic-reveal')
  if (errs.length) findings.push(`open-mic pageerror: ${errs[0]}`)
  for (const p of ph) await p.close()
  await ctx.close()
} catch (e) { findings.push(`open-mic: ${e.message.split('\n')[0]}`); console.log(`  ✗ open-mic threw: ${e.message.split('\n')[0]}`) }

// 5) Circuit Cypher: the 3D battle arena + vote.
try {
  console.log('\n• circuit-cypher (battle arena, vote)')
  const { ctx, host: h, code, errs } = await host(browser, 'circuit-cypher')
  const ph = [await join(browser, code, 'Al'), await join(browser, code, 'Bea')]
  await waitRoster(h, 2)
  await h.click('button:has-text("Start the cypher")')
  await sleep(1200)
  await clickAny(h, ['Open the mic'])
  await sleep(1000)
  for (const p of ph) { const ins = p.locator('.bars-input'); const n = await ins.count(); for (let i = 0; i < n; i++) await ins.nth(i).fill('my chrome heart beats to the boom bap night'); await clickAny(p, ['Lock in my verse']) }
  await sleep(1500)
  await clickAny(h, ['Close the mic'])
  await h.waitForSelector('.arena', { timeout: 60000 })
  // Skip through the title + intro to a perform/vote frame.
  for (let i = 0; i < 16; i++) { if (await h.locator('.vote, button:has-text("Reveal the winner")').count()) break; const s = h.locator('button[aria-label="Skip"]'); if (await s.count()) await s.click().catch(() => {}); await sleep(700) }
  await overflow(h, 'cypher arena'); await shot(h, 'cypher-arena')
  if (errs.length) findings.push(`circuit-cypher pageerror: ${errs[0]}`)
  for (const p of ph) await p.close()
  await ctx.close()
} catch (e) { findings.push(`circuit-cypher: ${e.message.split('\n')[0]}`); console.log(`  ✗ cypher threw: ${e.message.split('\n')[0]}`) }

// 6) Truth or Share: the result state (richest of the turn phases).
try {
  console.log('\n• truth-or-share (turn result)')
  const { ctx, host: h, code, errs } = await host(browser, 'truth-or-share')
  const ph = [await join(browser, code, 'Al'), await join(browser, code, 'Bea'), await join(browser, code, 'Cy')]
  await waitRoster(h, 3)
  await h.click('button:has-text("Start the show")')
  await h.waitForSelector('text=is choosing', { timeout: 60000 })
  let picker = null
  for (let a = 0; a < 20 && !picker; a++) { for (const p of ph) if (await p.locator('button:has-text("Put them on the spot")').count()) { picker = p; break } if (!picker) await sleep(500) }
  if (picker) {
    await picker.locator('.opt:not(.prompt)').first().click()
    await picker.locator('.opt.prompt').first().click()
    await picker.click('button:has-text("Put them on the spot")')
    let target = null
    for (let a = 0; a < 20 && !target; a++) { for (const p of ph) if (await p.locator('.answer-input').count()) { target = p; break } if (!target) await sleep(500) }
    if (target) { await target.fill('.answer-input', 'a long heartfelt answer that should wrap nicely on the big club screen without spilling over'); await target.click('button:has-text("Answer")') }
    await h.waitForSelector('text=Your call, host', { timeout: 30000 }).catch(() => {})
    await overflow(h, 'tos moderate'); await shot(h, 'tos-moderate')
    await clickAny(h, ['Show the room'])
    await sleep(1000)
    await overflow(h, 'tos react'); await shot(h, 'tos-react')
    await clickAny(h, ['Wrap up the turn'])
    await sleep(1000)
    await overflow(h, 'tos result'); await shot(h, 'tos-result')
  }
  if (errs.length) findings.push(`truth-or-share pageerror: ${errs[0]}`)
  for (const p of ph) await p.close()
  await ctx.close()
} catch (e) { findings.push(`truth-or-share: ${e.message.split('\n')[0]}`); console.log(`  ✗ tos threw: ${e.message.split('\n')[0]}`) }

await browser.close()
console.log(`\n=== ${findings.length} finding(s) ===`)
for (const f of findings) console.log(`  - ${f}`)
