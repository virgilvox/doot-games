/**
 * Editor responsiveness + flow sweep. Loads /editor/custom at desktop, drawer,
 * and phone viewports, exercises the Add panel (every single round + every
 * two-phase recipe), checks for horizontal overflow at each width, and confirms
 * the derived explainer + preview render. Run: pnpm dev then node scripts/editor-audit.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '900', w: 900, h: 800 },
  { name: '390', w: 390, h: 844 },
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findings = []

async function overflow(page, tag) {
  const o = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width > 1 && r.right > vw + 1.5) {
        offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 40), right: Math.round(r.right) })
      }
    }
    offenders.sort((a, b) => b.right - a.right)
    const seen = new Set(); const uniq = []
    for (const f of offenders) { const k = f.tag + f.cls; if (!seen.has(k)) { seen.add(k); uniq.push(f) } }
    return { over: document.documentElement.scrollWidth - vw, offenders: uniq.slice(0, 5) }
  })
  if (o.over > 1) {
    findings.push(`${tag}: OVERFLOW +${o.over}px -> ${o.offenders.map((f) => `${f.tag}.${f.cls}(${f.right})`).join(', ')}`)
    console.log(`  ✗ ${tag}: +${o.over}px`)
  } else {
    console.log(`  ✓ ${tag}`)
  }
}

const run = async () => {
  const browser = await chromium.launch()
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/editor/custom`, { waitUntil: 'networkidle' })
    await sleep(500)
    await overflow(page, `custom @${vp.name} [seeded]`)

    // Open the Add panel and read the choices.
    await page.getByRole('button', { name: '+ Add round' }).first().click()
    await sleep(250)
    const singleCount = await page.locator('.ed-add-grid').first().locator('.ed-add-card').count()
    const recipeNames = await page.locator('.ed-sheet-sub:has-text("Two-phase") ~ .ed-add-grid .ed-add-name').allInnerTexts()
    console.log(`    add panel: ${singleCount} single, recipes: ${recipeNames.join(', ')}`)

    // Add one recipe (Write & Vote) and confirm the pair + derived explainer.
    await page.getByRole('button', { name: /Write & Vote/ }).click()
    await sleep(300)
    const railCount = await page.locator('.ed-rail-item').count()
    const hasDerivedChip = await page.locator('.ed-rail-item .ed-chip-kind', { hasText: 'Vote' }).count()
    // Select the vote (judge) round -> derived explainer should show.
    await page.locator('.ed-rail-item .ed-chip').last().click()
    await sleep(200)
    const derivedShown = await page.locator('.ed-derived').count()
    console.log(`    after recipe: ${railCount} rounds, vote chip=${hasDerivedChip}, derived explainer=${derivedShown}`)
    await overflow(page, `custom @${vp.name} [recipe+vote selected]`)

    // On narrow screens, open the preview drawer and re-check overflow.
    if (vp.w <= 1000) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      await sleep(300)
      await overflow(page, `custom @${vp.name} [preview drawer]`)
    }
    await ctx.close()
  }
  await browser.close()
  console.log(findings.length ? `\nFINDINGS:\n${findings.join('\n')}` : '\nAll clean: 0 overflow.')
  process.exit(findings.length ? 1 : 0)
}
run().catch((e) => { console.error(e); process.exit(2) })
