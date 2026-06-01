/**
 * Real-browser smoke of the Circuit Cypher 1v1 tournament (the custom flow).
 * Drives a host + 3 phones through: write verses -> close the mic -> the battle
 * begins (mounts the 3D arena + audio + sequencer) -> skip through one matchup's
 * performances -> the crowd votes -> reveal -> next, capturing any console error
 * or uncaught exception along the way. Not part of the unit suite (needs a
 * browser + dev server). Run:  pnpm dev  then  node scripts/cypher-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text()
      // Ignore benign noise: favicon, audio autoplay policy, missing-voice TTS.
      if (/favicon|autoplay|not allowed to start|AudioContext|speechSynthesis/i.test(t)) return
      errors.push(`[${who} console] ${t}`)
    }
  })
  page.on('pageerror', (e) => errors.push(`[${who} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`))
}

const NAMES = ['Volt', 'Drive', 'Sparky']

async function joinPhones(browser, code, names = NAMES) {
  const players = []
  for (const name of names) {
    const p = await (await browser.newContext()).newPage()
    watch(p, name)
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 60000 })
    await p.fill('input[placeholder="e.g. Robin"]', name)
    await p.click('button:has-text("Join game")')
    await p.waitForSelector('text=in the cypher', { timeout: 60000 })
    players.push(p)
  }
  return players
}

async function writeVerses(players) {
  for (const p of players) {
    await p.waitForSelector('.bars-input', { timeout: 60000 })
    const inputs = p.locator('.bars-input')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) await inputs.nth(i).fill('my circuits run hot tonight')
    await p.click('button:has-text("Lock in my verse")')
    await p.waitForSelector('text=Bars locked in', { timeout: 60000 })
  }
}

// Scenario B: live-perform mode + a delegated MC driving from their phone.
async function scenarioCohostLive(browser) {
  step('Scenario B: live-perform mode + co-host driving from a phone')
  const host = await (await browser.newContext()).newPage()
  watch(host, 'hostB')
  await host.goto(`${BASE}/host/circuit-cypher`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  const players = await joinPhones(browser, code)

  await host.click('button:has-text("Players, live")') // perform mode = live
  await host.click('text=Let the first to join drive') // delegate to the first phone
  await host.click('button:has-text("Start the cypher")')
  ok('host set live mode + delegated to the first phone, started')

  // The MC phone drives the write phase from its own screen.
  const mc = players[0]
  await mc.waitForSelector('.drive-go', { timeout: 60000 })
  await mc.click('.drive-go') // "Open the mic"
  await writeVerses(players)
  await mc.waitForSelector('.drive-go:has-text("Close the mic")', { timeout: 60000 })
  await mc.click('.drive-go') // "Close the mic" -> battle begins
  await host.waitForSelector('.arena', { timeout: 60000 })
  ok('MC drove open + close from their phone; battle started')

  // Live-perform shows the PERFORM LIVE tag + a countdown during a performance.
  await host.waitForSelector('.live-tag', { timeout: 60000 })
  ok('live-perform countdown shown')

  // The MC drives the battle steps too (skip -> vote -> reveal -> next ... crown).
  for (let i = 0; i < 60; i++) {
    if (await host.locator('.rhead h1').count()) break
    const label = await mc.locator('.drive-go').textContent().catch(() => '')
    if (/Reveal/.test(label || '')) {
      // cast a couple of votes first so the reveal has a winner
      for (const p of players) {
        const opt = p.locator('.vote-opt:not([disabled])').first()
        if (await opt.count()) await opt.click().catch(() => {})
      }
    }
    const btn = mc.locator('.drive-go')
    if (await btn.count()) await btn.click().catch(() => {})
    await host.waitForTimeout(450)
  }
  await host.waitForSelector('.rhead h1', { timeout: 60000 })
  ok('MC drove the whole battle to the crown')
}

async function run() {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  })
  try {
    step('Scenario A: host-driven, robots perform')
    step('Host opens Circuit Cypher')
    const host = await (await browser.newContext()).newPage()
    watch(host, 'host')
    await host.goto(`${BASE}/host/circuit-cypher`)
    await host.waitForSelector('.code', { timeout: 60000 })
    const code = (await host.textContent('.code')).trim()
    ok(`room code = ${code}`)

    step('3 phones join and write verses')
    const players = []
    for (const name of NAMES) {
      const p = await (await browser.newContext()).newPage()
      watch(p, name)
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 60000 })
      await p.fill('input[placeholder="e.g. Robin"]', name)
      await p.click('button:has-text("Join game")')
      await p.waitForSelector('text=in the cypher', { timeout: 60000 })
      players.push(p)
    }
    ok('3 players in the lobby')

    await host.click('button:has-text("Start the cypher")')
    await host.click('button:has-text("Open the mic")')
    ok('host opened the mic')

    const leadLines = []
    for (const p of players) {
      await p.waitForSelector('.bars-input', { timeout: 60000 })
      // Capture this player's robot lead lines (their scaffold) to prove each
      // performer got a DIFFERENT verse to work with.
      leadLines.push((await p.locator('.lead').allTextContents()).join(' | '))
      const inputs = p.locator('.bars-input')
      const n = await inputs.count()
      for (let i = 0; i < n; i++) await inputs.nth(i).fill('my circuits run hot tonight')
      await p.click('button:has-text("Lock in my verse")')
      await p.waitForSelector('text=Bars locked in', { timeout: 60000 })
    }
    const distinct = new Set(leadLines).size
    ok(`all 3 verses locked in; ${distinct}/${players.length} got a distinct scaffold`)
    if (distinct < players.length) errors.push(`scaffolds not unique: ${JSON.stringify(leadLines)}`)

    step('Close the mic -> the battle begins (3D arena + sequencer)')
    await host.waitForSelector('button:has-text("Close the mic")', { timeout: 60000 })
    await host.click('button:has-text("Close the mic")')
    await host.waitForSelector('.arena', { timeout: 60000 })
    await host.waitForSelector('.round-tag', { timeout: 60000 })
    ok('battle arena mounted (HUD: ' + (await host.textContent('.round-tag')).trim() + ')')
    const hasCanvas = await host.locator('.rap-stage canvas').count()
    ok(hasCanvas ? '3D canvas present' : '3D canvas absent (WebGL unavailable; overlays still drive the show)')

    step('Skip through the performances to the vote')
    for (let i = 0; i < 40; i++) {
      if (await host.locator('.vote h2').count()) break
      const skip = host.locator('.ctrl[aria-label="Skip"]')
      if (await skip.count()) await skip.click().catch(() => {})
      await host.waitForTimeout(350)
    }
    await host.waitForSelector('.vote h2', { timeout: 60000 })
    ok('reached the head-to-head vote')

    step('Phones vote')
    let voted = 0
    for (const p of players) {
      const opt = p.locator('.vote-opt:not([disabled])').first()
      if (await opt.count()) {
        await opt.click().catch(() => {})
        voted++
      }
    }
    ok(`${voted} phones cast a vote`)
    // The host must actually RECEIVE the votes (the live tally climbs) before we
    // reveal - this confirms the custom relay channel delivers to the host.
    let tallySeen = 0
    for (let i = 0; i < 30; i++) {
      const pct = (await host.locator('.voter .pct').allTextContents()).join(' ')
      tallySeen = (pct.match(/\d+/g) || []).reduce((a, n) => a + Number(n), 0)
      if (tallySeen > 0) break
      await host.waitForTimeout(200)
    }
    if (tallySeen > 0) ok(`host received votes (live tally = ${tallySeen})`)
    else errors.push('host never received any votes (custom channel not delivering)')

    await host.click('button:has-text("Reveal the winner")')
    await host.waitForSelector('button:has-text("Next battle"), button:has-text("Crown the MC")', { timeout: 60000 })
    ok('winner revealed; result card shown')

    // Drive the rest of the tournament to the final crown.
    for (let guard = 0; guard < 12; guard++) {
      if (await host.locator('button:has-text("Crown the MC")').count()) {
        await host.click('button:has-text("Crown the MC")')
        break
      }
      await host.click('button:has-text("Next battle")')
      // skip to next vote
      for (let i = 0; i < 40; i++) {
        if (await host.locator('.vote h2').count()) break
        const skip = host.locator('.ctrl[aria-label="Skip"]')
        if (await skip.count()) await skip.click().catch(() => {})
        await host.waitForTimeout(300)
      }
      await host.waitForSelector('.vote h2', { timeout: 60000 })
      for (const p of players) {
        const opt = p.locator('.vote-opt:not([disabled])').first()
        if (await opt.count()) await opt.click().catch(() => {})
      }
      await host.click('button:has-text("Reveal the winner")')
      await host.waitForSelector('button:has-text("Next battle"), button:has-text("Crown the MC")', { timeout: 60000 })
    }

    await host.waitForSelector('.rhead h1', { timeout: 60000 })
    const headline = await host.locator('.rhead h1').textContent().catch(() => '')
    ok(`final results reached: "${(headline || '').trim()}"`)
    // With real votes counted, an MC should be crowned (cash > 0), not "closed".
    if (/runs the cypher/i.test(headline || '')) ok('a winner was crowned from real votes')
    else errors.push(`no winner crowned (votes likely not counted): "${(headline || '').trim()}"`)

    // a phone should show its results too
    const pRes = await players[0].locator('.results').count().catch(() => 0)
    ok(pRes ? 'phone shows the results' : 'phone results not asserted (non-fatal)')

    await scenarioCohostLive(browser)

    console.log('')
    if (errors.length) {
      console.log(`✗ ${errors.length} console/page error(s):`)
      for (const e of errors.slice(0, 20)) console.log('   ' + e)
      process.exitCode = 1
    } else {
      console.log('✓ No console or page errors through the full battle.')
    }
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  for (const e2 of errors.slice(0, 20)) console.error('   ' + e2)
  process.exit(1)
})
