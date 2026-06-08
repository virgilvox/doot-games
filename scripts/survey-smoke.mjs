/**
 * Real-browser smoke for Survey (Family Feud) against a running dev server. A
 * player reads the prompt, types a known top answer (from the built-in board), the
 * host reveals the "survey says" board with the answer found, and the phone shows a
 * positive score. 0 horizontal overflow at 390px. Run:
 *   pnpm dev   # in one shell
 *   node scripts/survey-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

// The #1 answer for each built-in survey prompt, so the smoke can score a match.
const TOP = {
  'Name a popular pizza topping.': 'Pepperoni',
  'Name something you do before bed.': 'Brush teeth',
  'Name a reason you might be late.': 'Traffic',
  'Name a fruit.': 'Apple',
  'Name something you find in a kitchen.': 'Fridge',
  'Name a popular pet.': 'Dog',
  'Name a type of weather.': 'Rain',
  'Name something you take to the beach.': 'Towel',
  'Name a breakfast food.': 'Eggs',
  'Name a color.': 'Blue',
  'Name something you bring on vacation.': 'Clothes',
  'Name a way to cook an egg.': 'Scrambled',
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

async function run() {
  const browser = await chromium.launch()
  try {
    step('Survey: a player names a top answer; the host reveals the board + scores it')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/survey`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`host room code = ${code}`)

    const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.locator('input').last().fill('Ana')
    await p.click('button:has-text("Join")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })
    ok('player joined')

    await host.click('button:has-text("Start game")')
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')

    await p.waitForSelector('.survey-input', { timeout: 40000 })
    const prompt = (await p.textContent('.prompt'))?.trim() ?? ''
    const top = TOP[prompt]
    if (!top) throw new Error(`unknown survey prompt (pool drift?): ${JSON.stringify(prompt)}`)
    await p.locator('.survey-input').first().fill(top)
    await noOverflow(p, 'survey input')
    await p.click('button:has-text("Lock it in")')
    await p.waitForSelector('text=Locked in', { timeout: 40000 })
    ok(`player answered "${top}" for "${prompt}"`)

    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    await host.click('button:has-text("Reveal")')

    // The host shows the "survey says" board with the player's answer found.
    await host.waitForSelector('.survey-host .brow.found', { timeout: 40000 })
    ok('host reveal shows the board with the answer found')
    // The phone shows a positive score.
    const score = (await p.textContent('.survey-reveal h2')) ?? ''
    if (!/You scored [1-9]/.test(score)) throw new Error(`expected a positive score, got: ${score}`)
    await noOverflow(p, 'survey reveal')
    ok(`player reveal: "${score.trim()}"`)

    console.log('\nPASS: survey-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
