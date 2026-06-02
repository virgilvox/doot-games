/**
 * Headed verification of the Circuit Cypher TTS fix: instruments speechSynthesis
 * on the host page, drives a real game into battle mode (robots-perform), then
 * lets the sequence PLAY (no skipping) and records, per utterance, whether it
 * fired `start` (actually spoke) / `end` (completed) / `error`. Asserts the robot
 * VERSE utterance speaks (the bug was it being silently dropped) and the MC lines
 * complete. Needs a headed browser with system voices (macOS). Run with a dev
 * server up:  BASE_URL=http://localhost:3200 node scripts/cypher-tts-verify.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3200'
const NAMES = ['Volt', 'Drive', 'Sparky']
const VERSE = 'my circuits run hot tonight'

const INSTRUMENT = () => {
  // record every utterance the app speaks, with its lifecycle events
  window.__tts = []
  const synth = window.speechSynthesis
  const orig = synth.speak.bind(synth)
  const t0 = performance.now()
  const ms = () => Math.round(performance.now() - t0)
  synth.speak = (u) => {
    const e = { text: String(u.text).replace(/\s+/g, ' ').slice(0, 44), voice: (u.voice && u.voice.name) || '?', spoke: ms(), start: 0, end: 0, error: null }
    window.__tts.push(e)
    u.addEventListener('start', () => { e.start = ms() })
    u.addEventListener('end', () => { e.end = ms() })
    u.addEventListener('error', (ev) => { e.error = ev.error })
    return orig(u)
  }
}

const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
try {
  const hostCtx = await browser.newContext()
  await hostCtx.addInitScript(INSTRUMENT)
  const host = await hostCtx.newPage()
  await host.goto(`${BASE}/host/circuit-cypher`)
  await host.waitForSelector('.code', { timeout: 60000 })
  const code = (await host.textContent('.code')).trim()
  console.log('room', code)

  const players = []
  for (const name of NAMES) {
    const p = await (await browser.newContext()).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 60000 })
    await p.fill('input[placeholder="e.g. Robin"]', name)
    await p.click('button:has-text("Join game")')
    await p.waitForSelector('text=in the cypher', { timeout: 60000 })
    players.push(p)
  }
  console.log('3 players joined')

  await host.click('button:has-text("Start the cypher")')
  await host.click('button:has-text("Open the mic")')
  for (const p of players) {
    await p.waitForSelector('.bars-input', { timeout: 60000 })
    const inputs = p.locator('.bars-input')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(VERSE)
    await p.click('button:has-text("Lock in my verse")')
    await p.waitForSelector('text=Bars locked in', { timeout: 60000 })
  }
  await host.waitForSelector('button:has-text("Close the mic")', { timeout: 60000 })
  await host.click('button:has-text("Close the mic")')
  await host.waitForSelector('.arena', { timeout: 60000 })
  console.log('battle started; letting the sequence PLAY (no skipping) for ~40s...')

  // Let title -> banner -> introA -> countA -> performA (the verse) play out.
  // Sample the karaoke + TTS log over time.
  let votedOnce = false
  for (let i = 0; i < 75; i++) {
    // Once the vote appears, cast votes so the round resolves and we can watch a
    // SECOND matchup's verses too (the previous run cut off before verse 2).
    if (await host.locator('.vote h2').count() && !votedOnce) {
      for (const p of players) {
        const opt = p.locator('.vote-opt:not([disabled])').first()
        if (await opt.count()) await opt.click().catch(() => {})
      }
      const rev = host.locator('button:has-text("Reveal the winner")')
      if (await rev.count()) await rev.click().catch(() => {})
      const next = host.locator('button:has-text("Next battle")')
      if (await next.count()) await next.click().catch(() => {})
      votedOnce = true
    }
    if (await host.locator('.rhead h1').count()) break // tournament crowned
    await host.waitForTimeout(1000)
  }

  const tts = await host.evaluate(() => window.__tts)
  console.log('=== TTS utterances spoken on host (ms timeline) ===')
  for (const e of tts) {
    console.log(`  [${e.voice}] spoke@${e.spoke} start@${e.start || '-'} end@${e.end || '-'} err=${e.error ?? '-'}  "${e.text}"`)
  }
  const verseUtt = tts.filter((e) => e.text.toLowerCase().includes('circuit') || /processor|voltage|memory|hands/i.test(e.text))
  const mcUtt = tts.filter((e) => /welcome|matchup|on the mic|and now/i.test(e.text))
  const verseSpoke = verseUtt.filter((e) => e.start).length
  const mcCompleted = mcUtt.some((e) => e.end)
  const dropped = tts.filter((e) => !e.start && !e.end && !e.error)
  console.log('\n=== ASSERTIONS ===')
  console.log(`  robot VERSES that spoke (onstart): ${verseSpoke} / ${verseUtt.length}`)
  console.log(`  MC line completed (onend):   ${mcCompleted}  [${mcUtt.length} mc utterances]`)
  console.log(`  dropped (never start/end/error): ${dropped.length}  ${dropped.map((e) => `"${e.text.slice(0, 18)}"@${e.spoke}`).join(', ')}`)
  const pass = verseSpoke === verseUtt.length && verseUtt.length >= 2 && mcCompleted && dropped.length === 0
  console.log(pass ? '\n=> PASS (every verse spoke, nothing dropped)' : '\n=> CHECK (see log above)')
} finally {
  await browser.close()
}
