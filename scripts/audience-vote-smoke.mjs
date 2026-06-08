/**
 * Real-browser smoke for P4 Phase B (audience voting on polls) against a running dev
 * server. A player joins and votes; a spectator "just watches" then votes with the
 * crowd; the host's poll shows the combined bars + a "crowd" note, while the
 * spectator never reads player inputs. Run:
 *   pnpm dev   # in one shell
 *   node scripts/audience-vote-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

async function run() {
  const browser = await chromium.launch()
  try {
    step('Audience votes on a poll; the big screen folds in a capped crowd bloc')
    const host = await (await browser.newContext()).newPage()
    await host.goto(`${BASE}/host/would-you-rather`)
    await host.waitForSelector('.code', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()

    // A player joins.
    const player = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await player.goto(`${BASE}/play/${code}`)
    await player.waitForSelector('input', { timeout: 40000 })
    await player.locator('input').last().fill('Ana')
    await player.click('button:has-text("Join")')
    await player.waitForSelector('text=You are in', { timeout: 40000 })

    // A spectator "just watches".
    const aud = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await aud.goto(`${BASE}/play/${code}`)
    await aud.waitForSelector('.watch-link', { timeout: 40000 })
    await aud.click('.watch-link')
    await aud.waitForSelector("text=You're watching", { timeout: 40000 })
    ok('a player joined and a spectator is watching')

    await host.click('button:has-text("Start game")')
    await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
    await host.click('button:has-text("Open voting")')

    // The player votes.
    await player.waitForSelector('.opt', { timeout: 40000 })
    await player.locator('.opt').first().click()
    await player.click('button:has-text("Lock it in")')

    // The spectator gets a crowd-vote UI and votes.
    await aud.waitForSelector('.aud-opt', { timeout: 40000 })
    await aud.locator('.aud-opt').first().click()
    await aud.waitForSelector('text=Your vote is in', { timeout: 40000 })
    ok('the spectator voted with the crowd (sees a confirmation)')

    // The host's poll shows the crowd note (the audience bloc folded in).
    await host.waitForSelector('.crowd-note', { timeout: 40000 })
    const note = (await host.textContent('.crowd-note')) ?? ''
    if (!/watching voted/.test(note)) throw new Error(`expected a crowd note, got: ${note}`)
    ok(`big screen shows the crowd bloc: "${note.trim()}"`)

    console.log('\nPASS: audience-vote-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
