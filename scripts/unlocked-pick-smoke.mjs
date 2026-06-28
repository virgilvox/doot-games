/**
 * Real-browser check: a player who SELECTS an answer but never taps "Lock it in"
 * still has their pick counted when the round closes (host locks / timer runs out).
 * Hosts a one-round poll, the phone selects without locking, the host locks +
 * reveals, and the tally must show the vote. Run with the dev server up:
 *   pnpm dev
 *   node scripts/unlocked-pick-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

const DRAFT = {
  pluginId: 'custom',
  config: {
    title: 'Unlocked pick',
    rounds: [
      { block: 'poll', content: { prompt: 'Pick one', timer: null, options: [{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }] } },
    ],
    settings: { autoAdvance: false },
  },
}

async function run() {
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript((d) => {
      try { sessionStorage.setItem('doot-game-draft', JSON.stringify(d)) } catch {}
    }, DRAFT)
    const host = await ctx.newPage()
    await host.goto(`${BASE}/host/custom`)
    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    const code = (await host.textContent('.code')).trim()
    ok(`room ${code}`)

    const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
    await p.goto(`${BASE}/play/${code}`)
    await p.waitForSelector('input', { timeout: 40000 })
    await p.locator('input').last().fill('Ana')
    await p.click('button:has-text("Join")')
    await p.waitForSelector('text=You are in', { timeout: 40000 })

    await host.bringToFront()
    await host.click('button:has-text("Start game")')
    // Open the round (auto-open can lag in a headless tab).
    const openBtn = host.locator('button:has-text("Open voting")')
    await openBtn.waitFor({ timeout: 40000 }).catch(() => {})
    if (await openBtn.count()) await openBtn.click()

    step('Phone SELECTS "Banana" but does NOT tap "Lock it in"')
    await p.bringToFront()
    await p.waitForSelector('.opt', { timeout: 40000 })
    await p.locator('.opt', { hasText: 'Banana' }).click()
    // Confirm we did NOT submit: the "Lock it in" button is still there, unpressed.
    if (!(await p.locator('button:has-text("Lock it in")').count())) throw new Error('expected an unpressed "Lock it in" button')
    ok('selected, not locked in')

    step('Host closes voting (lock) then reveals')
    await host.bringToFront()
    await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
    await host.click('button:has-text("Lock voting")')
    await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
    // give the phone's auto-submit a moment to land before scoring
    await host.waitForTimeout(800)
    await host.click('button:has-text("Reveal")')
    await host.waitForTimeout(600)

    // The tally must show exactly one vote, on Banana (the unlocked pick).
    const counts = await host.evaluate(() => {
      const out = []
      for (const opt of document.querySelectorAll('.opt')) {
        const label = opt.querySelector('.otext')?.textContent?.trim() ?? ''
        const count = Number(opt.querySelector('.ocount')?.textContent?.trim() ?? '0')
        out.push({ label, count })
      }
      return out
    })
    const total = counts.reduce((a, c) => a + c.count, 0)
    const banana = counts.find((c) => c.label === 'Banana')?.count ?? 0
    if (total !== 1 || banana !== 1) {
      throw new Error(`expected 1 vote on Banana, got ${JSON.stringify(counts)}`)
    }
    ok(`unlocked pick counted: ${JSON.stringify(counts)}`)
    console.log('\nPASS: unlocked-pick-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
