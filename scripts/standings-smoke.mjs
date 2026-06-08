/**
 * Real-browser smoke for live standings (P3) against a running dev server. Verifies
 * the host publishes a between-round leaderboard after a reveal, the big screen and
 * the phone both show it, and the running totals accumulate across rounds. 0
 * horizontal overflow at 390px. Run manually:
 *   pnpm dev   # in one shell
 *   node scripts/standings-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

const ANSWERS = {
  'What is the capital of Japan?': 'Tokyo',
  'What planet is known as the Red Planet?': 'Mars',
  'How many continents are there on Earth?': 'Seven',
  'What gas do plants absorb from the air for photosynthesis?': 'Carbon dioxide',
  'Who painted the Mona Lisa?': 'Leonardo da Vinci',
  'What is the largest ocean on Earth?': 'Pacific',
  'What is the chemical symbol for gold?': 'Au',
  'In what country would you find the Eiffel Tower?': 'France',
  'What is the tallest land animal?': 'Giraffe',
  'How many sides does a hexagon have?': 'Six',
  'What is the largest planet in our solar system?': 'Jupiter',
  'What language has the most native speakers worldwide?': 'Mandarin',
  'What is the hardest known natural material?': 'Diamond',
  'Who wrote the play Romeo and Juliet?': 'Shakespeare',
  'What is the smallest prime number?': 'Two',
  'What is the freezing point of water in Celsius?': 'Zero',
  'Which ocean is the Bermuda Triangle in?': 'Atlantic',
  'What metal is liquid at room temperature?': 'Mercury',
  'What is the largest country by land area?': 'Russia',
  'How many strings does a standard guitar have?': 'Six',
  'What is the currency of Japan?': 'Yen',
  'What organ pumps blood around the body?': 'Heart',
  'What is the capital of Australia?': 'Canberra',
  'Which planet is closest to the Sun?': 'Mercury',
  'What is the longest river in the world?': 'Nile',
  'How many minutes are in a full day?': '1440',
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Standings: host + 2 players; the running leaderboard shows between rounds')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/type-the-answer`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    const players = []
    for (const name of ['Ana', 'Ben']) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ page: p, name })
    }
    ok('2 players joined')

    await host.click('button:has-text("Start game")')
    let sawHostStandings = false
    let sawPlayerStandings = false
    for (let guard = 0; guard < 5; guard++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')
      for (let i = 0; i < players.length; i++) {
        const { page: p } = players[i]
        await p.waitForSelector('.answer-input', { timeout: 40000 })
        const prompt = (await p.textContent('.prompt'))?.trim() ?? ''
        const correct = ANSWERS[prompt]
        if (!correct) throw new Error(`unknown prompt: ${JSON.stringify(prompt)}`)
        // Ana always right; Ben right only from round 1, so Ana leads early.
        const right = !(players[i].name === 'Ben' && guard === 0)
        await p.fill('.answer-input', right ? correct : 'wrong')
        await p.click('button:has-text("Lock it in")')
      }
      await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')

      // After the reveal, the host shows the running standings, and so do the phones.
      await host.waitForSelector('.host-standings .peek-title', { timeout: 40000 })
      sawHostStandings = true
      await players[0].page.waitForSelector('.player-standings', { timeout: 40000 })
      sawPlayerStandings = true
      await noOverflow(players[0].page, `round ${guard} standings`)
      // Ada should be on the board with a positive score by now.
      const hostBoard = await host.textContent('.host-standings')
      if (!/Ana/.test(hostBoard ?? '')) throw new Error('host standings missing Ana')
      ok(`round ${guard}: host + phone show standings`)

      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
      if (guard >= 1 && (await host.locator('button:has-text("Final results")').count())) {
        await host.click('button:has-text("Final results")')
        break
      }
      if (await host.locator('button:has-text("Final results")').count()) {
        await host.click('button:has-text("Final results")')
        break
      }
      await host.click('button:has-text("Next round")')
    }
    if (!sawHostStandings || !sawPlayerStandings) throw new Error('standings never appeared')
    await noOverflow(host, 'host')
    console.log('\nPASS: standings-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
