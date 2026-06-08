/**
 * Real-browser smoke for the audience tier (P4 Phase A) against a running dev
 * server. A spectator joins via "Just watch" (no name), follows along read-only
 * (prompt + status + standings, no input), the host counts them as "watching", and
 * they never appear in the player roster. 0 horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/audience-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

const ANSWERS = {
  'What is the capital of Japan?': 'Tokyo', 'What planet is known as the Red Planet?': 'Mars',
  'How many continents are there on Earth?': 'Seven', 'What gas do plants absorb from the air for photosynthesis?': 'Carbon dioxide',
  'Who painted the Mona Lisa?': 'Leonardo da Vinci', 'What is the largest ocean on Earth?': 'Pacific',
  'What is the chemical symbol for gold?': 'Au', 'In what country would you find the Eiffel Tower?': 'France',
  'What is the tallest land animal?': 'Giraffe', 'How many sides does a hexagon have?': 'Six',
  'What is the largest planet in our solar system?': 'Jupiter', 'What language has the most native speakers worldwide?': 'Mandarin',
  'What is the hardest known natural material?': 'Diamond', 'Who wrote the play Romeo and Juliet?': 'Shakespeare',
  'What is the smallest prime number?': 'Two', 'What is the freezing point of water in Celsius?': 'Zero',
  'Which ocean is the Bermuda Triangle in?': 'Atlantic', 'What metal is liquid at room temperature?': 'Mercury',
  'What is the largest country by land area?': 'Russia', 'How many strings does a standard guitar have?': 'Six',
  'What is the currency of Japan?': 'Yen', 'What organ pumps blood around the body?': 'Heart',
  'What is the capital of Australia?': 'Canberra', 'Which planet is closest to the Sun?': 'Mercury',
  'What is the longest river in the world?': 'Nile', 'How many minutes are in a full day?': '1440',
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Audience: a spectator watches read-only while a player plays')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/type-the-answer`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    // A real player joins.
    const player = await (await browser.newContext()).newPage()
    await player.goto(`${BASE}/play/${code}`)
    await player.waitForSelector('input', { timeout: 40000 })
    await player.locator('input').last().fill('Ana')
    await player.click('button:has-text("Join")')
    await player.waitForSelector('text=You are in', { timeout: 40000 })
    ok('player joined')

    // A spectator joins via "Just watch" (no name).
    const aud = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await aud.goto(`${BASE}/play/${code}`)
    await aud.waitForSelector('button:has-text("Just watch instead")', { timeout: 40000 })
    await aud.click('button:has-text("Just watch instead")')
    await aud.waitForSelector('text=You\'re watching', { timeout: 40000 })
    ok('spectator joined as audience (no name)')

    // The host counts the watcher but does NOT roster them as a player.
    await host.waitForSelector('text=watching', { timeout: 40000 })
    const rosterCount = await host.textContent('.count')
    if (!/1 joined/.test(rosterCount ?? '')) throw new Error(`expected 1 player joined, got: ${rosterCount}`)
    if (!/watching/.test(rosterCount ?? '')) throw new Error('host does not show a watcher')
    ok(`host shows "${(rosterCount ?? '').trim()}"`)

    await host.click('button:has-text("Start game")')
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')

    // The audience sees the prompt + a status line, and has NO input controls.
    await aud.waitForSelector('.aud .prompt', { timeout: 40000 })
    await aud.waitForSelector('.aud .status', { timeout: 40000 })
    if (await aud.locator('.answer-input').count()) throw new Error('audience should have no input field')
    if (await aud.locator('button:has-text("Lock it in")').count()) throw new Error('audience should have no submit button')
    await noOverflow(aud, 'audience open round')
    ok('audience sees the prompt, no input controls')

    // Player answers; host reveals; the audience now sees the standings.
    const prompt = (await player.textContent('.prompt'))?.trim() ?? ''
    await player.fill('.answer-input', ANSWERS[prompt] ?? 'x')
    await player.click('button:has-text("Lock it in")')
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')

    await aud.waitForSelector('.aud-standings', { timeout: 40000 })
    await noOverflow(aud, 'audience reveal')
    ok('audience sees the running standings at reveal')

    console.log('\nPASS: audience-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
