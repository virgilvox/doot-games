/**
 * Real-browser smoke of the three new games (Faker, Open Mic, Truth or Share):
 * mounts each host + phones and drives enough of the flow to render the risky
 * custom views (FakerPlayer per-player content, the ComedyStage 3D mount, the
 * Truth or Share turn sequencer + moderation gate), capturing any console error or
 * uncaught exception. Also live-checks two withholding invariants:
 *   - Faker: the secret word a non-faker sees on their phone is NOT on the big screen.
 *   - Truth or Share: the target's answer is hidden on other phones until the host approves.
 * Not part of the unit suite (needs a browser + dev server). Run:
 *   pnpm dev   then   node scripts/new-games-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []
const fail = (m) => { errors.push(m); console.log(`  ✗ ${m}`) }

function watch(page, who) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/favicon|autoplay|not allowed to start|AudioContext|speechSynthesis|WebGL|Failed to load resource/i.test(t)) return
    errors.push(`[${who} console] ${t}`)
  })
  page.on('pageerror', (e) => errors.push(`[${who} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 3).join('\n')}`))
}

async function hostGame(browser, slug, lobbyText) {
  const host = await (await browser.newContext()).newPage()
  watch(host, `host:${slug}`)
  await host.goto(`${BASE}/host/${slug}`)
  await host.waitForSelector('.big-code', { timeout: 60000 })
  const code = (await host.textContent('.big-code')).trim()
  ok(`${slug}: host lobby rendered (code ${code})`)
  return { host, code }
}

async function join(browser, code, name, readyText) {
  const p = await (await browser.newContext()).newPage()
  watch(p, name)
  await p.goto(`${BASE}/play/${code}`)
  await p.waitForSelector('input[placeholder="e.g. Robin"]', { timeout: 60000 })
  await p.fill('input[placeholder="e.g. Robin"]', name)
  await p.click('button:has-text("Join game")')
  if (readyText) await p.waitForSelector(`text=${readyText}`, { timeout: 60000 })
  return p
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Wait until the HOST's lobby roster shows all N players before starting (the host
// freezes the rotation / hidden-role assignment at start, so everyone must be
// present first; a real host watches the roster chips and does the same).
async function waitForRoster(host, n) {
  for (let i = 0; i < 40; i++) {
    const t = (await host.locator('.count').first().textContent().catch(() => '')) || ''
    if (t.includes(`${n} joined`)) return true
    await sleep(500)
  }
  return false
}

async function smokeFaker(browser) {
  step('Faker: clue round + accuse + reveal, with a live withholding check')
  const { host, code } = await hostGame(browser, 'faker')
  const players = []
  for (const n of ['Ada', 'Bo', 'Cy']) players.push(await join(browser, code, n, 'You are in'))
  if (!await waitForRoster(host, 3)) fail("Faker: host never saw 3 players");
  await host.click('button:has-text("Start game")')
  // Open the make round (it sits at "ready" until the host collects answers).
  await host.click('button:has-text("Collect answers")', { timeout: 60000 })
  // Each phone shows its secret role + the clue input.
  for (const p of players) await p.waitForSelector('#faker-clue', { timeout: 60000 })
  ok('all phones rendered the Faker role view')

  // Withholding: capture a non-faker's word, assert it is NOT on the big screen.
  let secretWord = ''
  for (const p of players) {
    const w = await p.locator('.word').first().textContent().catch(() => null)
    if (w && w.trim()) { secretWord = w.trim(); break }
  }
  if (secretWord) {
    const onScreen = await host.locator('body').textContent()
    if (onScreen.includes(secretWord)) fail(`Faker: secret word "${secretWord}" leaked onto the big screen`)
    else ok(`Faker: secret word stays off the big screen`)
  } else fail('Faker: could not read a non-faker word from any phone')

  for (let i = 0; i < players.length; i++) {
    await players[i].fill('#faker-clue', ['alpha', 'bravo', 'charlie'][i])
    await players[i].click('button:has-text("Lock it in")')
  }
  await sleep(1800)
  // Make round auto-locks on full submission; advance to the accusation, then open it.
  await host.click('button:has-text("Start the vote")').catch(() => {})
  await host.waitForSelector('button:has-text("Open voting")', { timeout: 60000 })
  await host.click('button:has-text("Open voting")')
  // Accuse round: each phone shows the attributed clues + a vote.
  await players[0].waitForSelector('.clue', { timeout: 60000 })
  ok('accuse round rendered the attributed clues on phones')
  for (const p of players) {
    const btns = p.locator('.clue:not([disabled])')
    if (await btns.count()) await btns.first().click()
    await p.click('button:has-text("Lock it in")').catch(() => {})
  }
  await sleep(1500)
  await host.click('button:has-text("Reveal")').catch(() => {})
  await host.waitForSelector('text=The faker was', { timeout: 60000 })
  ok('Faker reveal unmasked the faker on the big screen')
  await host.close()
  for (const p of players) await p.close()
}

async function smokeOpenMic(browser) {
  step('Open Mic: write bits, start the set (mounts ComedyStage), reach the vote')
  const { host, code } = await hostGame(browser, 'open-mic')
  const players = []
  for (const n of ['Joke1', 'Joke2', 'Joke3']) players.push(await join(browser, code, n, 'You'))
  if (!await waitForRoster(host, 3)) fail("Open Mic: host never saw 3 players");
  await host.click('button:has-text("Start the show")')
  await host.waitForSelector('button:has-text("Open the mic")', { timeout: 60000 })
  await host.click('button:has-text("Open the mic")')
  for (const p of players) {
    await p.waitForSelector('textarea', { timeout: 60000 })
    await p.fill('textarea', 'I told my robot a joke and it short circuited')
    await p.click('button:has-text("Lock it in")')
  }
  await sleep(1500)
  await host.click('button:has-text("Close the mic")').catch(() => {})
  await host.click('button:has-text("Start the set")')
  // The 3D comedy club mounts.
  await host.waitForSelector('.comedy-stage canvas', { timeout: 60000 })
  ok('ComedyStage 3D canvas mounted')
  // Skip through the performances to the vote.
  for (let i = 0; i < 10; i++) {
    const reveal = await host.locator('button:has-text("Reveal the funniest")').count()
    if (reveal) break
    const skip = host.locator('button[aria-label="Skip"]')
    if (await skip.count()) await skip.click().catch(() => {})
    await sleep(900)
  }
  await host.waitForSelector('button:has-text("Reveal the funniest")', { timeout: 60000 })
  ok('Open Mic reached the vote after the set')
  await host.close()
  for (const p of players) await p.close()
}

async function smokeTruthOrShare(browser) {
  step('Truth or Share: a turn through the moderation gate, with a live gate check')
  const { host, code } = await hostGame(browser, 'truth-or-share')
  const players = []
  for (const n of ['Pat', 'Sam', 'Lee']) players.push(await join(browser, code, n, 'You'))
  if (!await waitForRoster(host, 3)) fail("Truth or Share: host never saw 3 players");
  await host.click('button:has-text("Start the show")')
  await host.waitForSelector('text=is choosing', { timeout: 60000 })
  ok('first turn rendered (pick phase)')

  // Find the picker phone (it shows "Put them on the spot"). Poll: the turn state
  // has to propagate over the relay first.
  let picker = null
  for (let attempt = 0; attempt < 20 && !picker; attempt++) {
    for (const p of players) {
      if (await p.locator('button:has-text("Put them on the spot")').count()) { picker = p; break }
    }
    if (!picker) await sleep(500)
  }
  if (!picker) { fail('Truth or Share: no picker phone showed the pick UI'); await host.close(); for (const p of players) await p.close(); return }
  // Wait for the roster (targets) to populate on the picker's phone before choosing.
  await picker.waitForSelector('.opt:not(.prompt)', { timeout: 30000 })
  const nTargets = await picker.locator('.opt:not(.prompt)').count()
  const nPrompts = await picker.locator('.opt.prompt').count()
  console.log(`    (picker sees ${nTargets} targets, ${nPrompts} prompts)`)
  await picker.locator('.opt:not(.prompt)').first().click() // a target
  await picker.locator('.opt.prompt').first().click() // a prompt
  await picker.click('button:has-text("Put them on the spot")')

  // The target answers (poll: the 'respond' turn state has to propagate).
  let target = null
  for (let attempt = 0; attempt < 20 && !target; attempt++) {
    for (const p of players) {
      if (await p.locator('.answer-input').count()) { target = p; break }
    }
    if (!target) await sleep(500)
  }
  if (!target) { fail('Truth or Share: target phone never showed the answer box'); await host.close(); for (const p of players) await p.close(); return }
  const secret = 'my deepest darkest confession'
  await target.fill('.answer-input', secret)
  await target.click('button:has-text("Answer")')

  // Moderation gate: the host sees it; other phones must NOT show it yet.
  await host.waitForSelector('text=Your call, host', { timeout: 60000 })
  const others = players.filter((p) => p !== target)
  let leaked = false
  for (const p of others) {
    const body = await p.locator('body').textContent()
    if (body.includes(secret)) leaked = true
  }
  if (leaked) fail('Truth or Share: the answer reached a phone BEFORE the host approved it')
  else ok('moderation gate holds: the answer is hidden until approval')

  await host.click('button:has-text("Show the room")')
  await host.waitForSelector('.answer', { timeout: 60000 })
  ok('approved answer reached the big screen')
  // React from another phone, then wrap up.
  for (const p of others) {
    const r = p.locator('.react').first()
    if (await r.count()) await r.click().catch(() => {})
  }
  await host.click('button:has-text("Wrap up the turn")')
  await host.waitForSelector('button:has-text("Next turn"), button:has-text("Final results")', { timeout: 60000 })
  ok('turn resolved to a result')
  await host.close()
  for (const p of players) await p.close()
}

const browser = await chromium.launch()
try {
  await smokeFaker(browser)
  await smokeOpenMic(browser)
  await smokeTruthOrShare(browser)
} catch (e) {
  fail(`threw: ${e.message}`)
} finally {
  await browser.close()
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} issue(s):`)
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
console.log('\n✓ all three new games smoked clean')
