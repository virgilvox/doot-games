/**
 * Real-browser smoke for Wager against a running dev server. A player bets a tier
 * and answers correctly, sees the "+bet" payoff, and the final bankroll on the
 * leaderboard exceeds the base. 0 horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/wager-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

// The built-in pool's correct answer LABEL per prompt, so the smoke can answer.
const CORRECT = {
  'What is the capital of Australia?': 'Canberra',
  'Which planet is the largest in our solar system?': 'Jupiter',
  'How many bones are in the adult human body?': '206',
  'What gas do plants absorb from the air?': 'Carbon dioxide',
  'What is the largest ocean on Earth?': 'Pacific',
  'Who painted the Mona Lisa?': 'Leonardo da Vinci',
  'What is the chemical symbol for gold?': 'Au',
  'What is the tallest land animal?': 'Giraffe',
  'How many continents are there on Earth?': 'Seven',
  'What is the hardest known natural material?': 'Diamond',
  'What is the smallest prime number?': '2',
  'Which of these is a noble gas?': 'Neon',
  'What is the capital of Japan?': 'Tokyo',
  'The speed of light is about how fast?': '300,000 km/s',
  'What is the largest country by land area?': 'Russia',
  'How many strings does a standard guitar have?': 'Six',
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Wager: bet a tier + answer right; the bankroll grows')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/wager`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()

    const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.locator('input').last().fill('Ana')
    await p.click('button:has-text("Join")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    ok('player joined')

    await host.click('button:has-text("Start game")')
    let sawPayoff = false
    for (let guard = 0; guard < 12; guard++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')
      await p.waitForSelector('.bet', { timeout: 40000 })
      const prompt = (await p.textContent('.prompt'))?.trim() ?? ''
      const label = CORRECT[prompt]
      if (!label) throw new Error(`unknown wager prompt (pool drift?): ${JSON.stringify(prompt)}`)
      await p.locator('.bet:has-text("500")').click()
      await p.locator(`.opt:has-text("${label}")`).first().click()
      await noOverflow(p, `round ${guard} input`)
      await p.click('button:has-text("Lock it in")')

      await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')

      // The phone shows the +500 payoff for a correct bet.
      if (!sawPayoff) {
        await p.waitForSelector('.wager-reveal h2:has-text("+500")', { timeout: 40000 })
        sawPayoff = true
        ok(`round ${guard}: "${prompt}" -> +500 payoff shown`)
      }
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
      if (guard >= 2 && (await host.locator('button:has-text("Final results")').count())) {
        await host.click('button:has-text("Final results")')
        break
      }
      if (await host.locator('button:has-text("Final results")').count()) {
        await host.click('button:has-text("Final results")')
        break
      }
      await host.click('button:has-text("Next round")')
    }
    if (!sawPayoff) throw new Error('never saw a bet payoff')

    // The final leaderboard shows a bankroll above the 1000 base (the player won bets).
    await host.waitForSelector('.rhead h1', { timeout: 40000 })
    const board = (await host.textContent('.results')) ?? ''
    if (!/[12]\d{3}|[2-9]\d{3}/.test(board)) throw new Error(`expected a bankroll > 1000 on the board, got: ${board.slice(0, 200)}`)
    await noOverflow(p, 'player results')
    ok('final leaderboard shows a grown bankroll')

    console.log('\nPASS: wager-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
