/**
 * Real-browser smoke for Teams (P5) against a running dev server. Verifies the
 * full team loop: the host turns teams on, two players each pick a team in the
 * lobby, the host roster shows the team tags, the game plays, and the results show
 * a team board with a crowned winning team. Also checks 0 horizontal overflow at
 * 390px. Run manually:
 *   pnpm dev   # in one shell
 *   node scripts/teams-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

// Built-in Type the Answer pool answers (canonical), so the smoke can answer.
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
    step('Teams: host enables teams, 2 players pick teams, play to a team board')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/type-the-answer`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    // Turn teams on (default 2: Red, Blue).
    await host.locator('.cap-row:has-text("Play in teams") input').check()
    await host.waitForSelector('button.round-opt:has-text("2").on', { timeout: 40000 })
    ok('host enabled teams (2)')

    const players = []
    for (const [name, team] of [['Ana', 'Red'], ['Ben', 'Blue']]) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      // Pick the team in the lobby.
      await p.waitForSelector(`button.team-opt:has-text("${team}")`, { timeout: 40000 })
      await p.click(`button.team-opt:has-text("${team}")`)
      await p.waitForSelector(`button.team-opt.on:has-text("${team}")`, { timeout: 40000 })
      await noOverflow(p, `${name} lobby`)
      players.push({ page: p, name, team })
      ok(`${name} joined and picked ${team}`)
    }

    // Host roster shows both team tags.
    await host.waitForSelector('.team-tag:has-text("Red")', { timeout: 40000 })
    await host.waitForSelector('.team-tag:has-text("Blue")', { timeout: 40000 })
    ok('host roster shows team tags')

    await host.click('button:has-text("Start game")')
    for (let guard = 0; guard < 12; guard++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')
      for (let i = 0; i < players.length; i++) {
        const { page: p } = players[i]
        await p.waitForSelector('.answer-input', { timeout: 40000 })
        const prompt = (await p.textContent('.prompt'))?.trim() ?? ''
        const correct = ANSWERS[prompt]
        if (!correct) throw new Error(`unknown prompt: ${JSON.stringify(prompt)}`)
        // Ben (Blue) misses round 0 so Red ends ahead and the headline crowns a winner.
        const right = !(players[i].name === 'Ben' && guard === 0)
        await p.fill('.answer-input', right ? correct : 'nope wrong answer')
        await p.click('button:has-text("Lock it in")')
      }
      await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
      if (guard >= 2 || (await host.locator('button:has-text("Final results")').count())) {
        if (await host.locator('button:has-text("Final results")').count()) {
          await host.click('button:has-text("Final results")')
          break
        }
      }
      await host.click('button:has-text("Next round")')
    }

    // Results: the team board is the first slide on the host.
    await host.waitForSelector('text=Team scores', { timeout: 40000 })
    await host.waitForSelector('.team-name:has-text("Red")', { timeout: 40000 })
    await host.waitForSelector('.team-name:has-text("Blue")', { timeout: 40000 })
    const headline = (await host.textContent('.rhead h1'))?.trim() ?? ''
    if (!/wins|tie/i.test(headline)) throw new Error(`unexpected team headline: ${JSON.stringify(headline)}`)
    ok(`host team board shown, headline = "${headline}"`)

    // Players see the team board on their phones too (compact).
    await players[0].page.waitForSelector('.team-name:has-text("Red")', { timeout: 40000 })
    await noOverflow(players[0].page, 'player results')
    ok('player sees the team board, 0 overflow')

    console.log('\nPASS: teams-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
