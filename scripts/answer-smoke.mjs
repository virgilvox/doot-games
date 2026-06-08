/**
 * Real-browser smoke for the `answer` block + Type the Answer game (Playwright +
 * Chromium against a running dev server). Verifies the type-the-answer loop end to
 * end: a player types an answer, locks it, the host reveals, and both the correct
 * and the wrong paths show the right phone feedback + the answer on the big screen.
 * Also checks 0 horizontal overflow on a 390px phone. Run manually:
 *   pnpm dev   # in one shell
 *   node scripts/answer-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

// The built-in pool's correct answers (canonical = the first accepted), so the
// smoke can type the right thing for whichever question the room seed drew.
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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 0) throw new Error(`${label}: ${overflow}px horizontal overflow`)
  ok(`${label}: 0 horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Type the Answer: host + player through correct and wrong rounds to results')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/type-the-answer`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    const player = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await player.goto(`${BASE}/play/${code}`)
    await player.waitForSelector('input', { timeout: 40000 })
    await player.locator('input').last().fill('Ana')
    await player.click('button:has-text("Join")')
    await player.waitForSelector('text=You are in', { timeout: 40000 })
    ok('player joined the lobby')

    await host.click('button:has-text("Start game")')

    let sawCorrect = false
    let sawWrong = false
    for (let guard = 0; guard < 12; guard++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')

      await player.waitForSelector('.answer-input', { timeout: 40000 })
      await noOverflow(player, `round ${guard} input`)
      const prompt = (await player.textContent('.prompt'))?.trim() ?? ''
      const correct = ANSWERS[prompt]
      if (!correct) throw new Error(`unknown prompt (pool drift?): ${JSON.stringify(prompt)}`)
      // Alternate: first round answer correctly, second deliberately wrong, then
      // back to correct, so we exercise both reveal paths at least once.
      const typeCorrect = guard !== 1
      await player.fill('.answer-input', typeCorrect ? correct : 'definitely wrong zzz')
      await player.click('button:has-text("Lock it in")')
      await player.waitForSelector('text=Locked in', { timeout: 40000 })

      await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')

      // Host big screen shows the answer.
      await host.waitForSelector('text=The answer', { timeout: 40000 })
      // Phone reveal: correct -> "Correct!", wrong -> "Not quite".
      if (typeCorrect) {
        await player.waitForSelector('text=Correct!', { timeout: 40000 })
        sawCorrect = true
      } else {
        await player.waitForSelector('text=Not quite', { timeout: 40000 })
        sawWrong = true
      }
      await noOverflow(player, `round ${guard} reveal`)
      ok(`round ${guard}: "${prompt}" -> ${typeCorrect ? 'correct' : 'wrong'} feedback shown`)

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
    if (!sawCorrect || !sawWrong) throw new Error(`did not exercise both paths (correct=${sawCorrect}, wrong=${sawWrong})`)

    await host.waitForSelector('text=/wins|results are in|crown/i', { timeout: 40000 })
    ok('reached final results')
    await noOverflow(player, 'player results')
    console.log('\nPASS: answer-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
