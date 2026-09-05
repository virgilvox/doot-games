/**
 * The editor's rounds rail, dragged for real.
 *
 * The feedback this exists for was "groups don't move together in drag order". The
 * ordering RULES are unit-tested (`apps/web/app/utils/rail.test.ts`) and the arrows are
 * easy to drive, so both looked green while dragging a section did nothing at all: the
 * reactive write inside `dragstart` made Vue patch the DOM mid-setup and Chrome
 * cancelled the drag. Only a real drag catches that, so this does real drags.
 *
 * Playwright's synthetic mouse cannot drive native HTML5 DnD (Chromium enters a nested
 * drag loop and the mouse API blocks), so this speaks CDP: `Input.setInterceptDrags`
 * hands us the drag payload at dragstart, and `Input.dispatchDragEvent` delivers the
 * dragEnter/dragOver/drop the page listens for.
 *
 * Usage:
 *   pnpm dev
 *   BASE_URL=http://localhost:3100 node_modules/.bin/jiti scripts/editor-drag-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

/**
 * Four rounds with DISTINCT prompts, the first two in one section. The rail labels
 * rounds by POSITION ("Round 3"), so only the prompt tells you whether a round really
 * travelled with its section or whether the section box merely landed around whichever
 * rounds now sit there.
 */
const FIXTURE = {
  pluginId: 'custom',
  themeId: 'doot',
  visibility: 'unlisted',
  config: {
    title: 'Editor Drag Smoke',
    groups: [{ id: 'warmup', name: 'Warm up' }],
    rounds: [
      { block: 'poll', group: 'warmup', content: { prompt: 'AAA', image: '', timer: null, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] } },
      { block: 'poll', group: 'warmup', content: { prompt: 'BBB', image: '', timer: null, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] } },
      { block: 'poll', content: { prompt: 'CCC', image: '', timer: null, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] } },
      { block: 'poll', content: { prompt: 'DDD', image: '', timer: null, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] } },
    ],
  },
}

async function saveFixture() {
  const email = `editordrag_${Date.now()}@doot.dev`
  const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: 'supersecret123', name: 'editordrag' }),
  })
  const cookie = (su.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) throw new Error(`signup gave no cookie (status ${su.status})`)
  const res = await fetch(`${BASE}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: JSON.stringify(FIXTURE),
  })
  if (!res.ok) throw new Error(`save failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return { id: (await res.json()).id, cookie }
}
const issues = []
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) issues.push(msg)
}

/** The rail by PROMPT, so a round is identifiable wherever it ends up. */
async function rail(p) {
  return p.evaluate(() =>
    [...document.querySelectorAll('.ed-rail-list > *')].map((el) => {
      const subs = [...el.querySelectorAll('.ed-chip-sub')].map((n) => n.textContent.trim())
      return el.classList.contains('ed-section')
        ? `[${(el.querySelector('.ed-section-input') || {}).value || '?'}: ${subs.join('+')}]`
        : subs[0] || '?'
    }),
  )
}

/** Press on `fromSel`, drag, and drop at the top or bottom edge of `toSel`. */
async function drag(p, cdp, fromSel, toSel, edge = 'bottom') {
  let data = null
  const onIntercept = (e) => { data = e.data }
  cdp.on('Input.dragIntercepted', onIntercept)
  const a = await p.locator(fromSel).first().boundingBox()
  if (!a) throw new Error(`no box for ${fromSel}`)
  const x = a.x + Math.min(10, a.width / 2)
  const y = a.y + a.height / 2
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 3, y: y + 10, button: 'left', buttons: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 5, y: y + 30, button: 'left', buttons: 1 })
  await p.waitForTimeout(200)
  cdp.off('Input.dragIntercepted', onIntercept)
  if (!data) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0 })
    return { started: false }
  }
  // One dragover over the source first: that is what turns the drag state on, which
  // inserts the "here's where it'll land" banner above the rail and shifts every row
  // down. Re-measure the target AFTER that, or the aim is a banner's height off and
  // the drop lands outside the list.
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y: y + 30, data })
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y: y + 30, data })
  await p.waitForTimeout(150)
  const t = await p.locator(toSel).first().boundingBox()
  // Aim inside the target's near edge, which is the half the rail reads as "insert
  // before" / "insert after".
  const tx = t.x + t.width / 2
  const ty = edge === 'top' ? t.y + Math.min(6, t.height / 4) : t.y + t.height - Math.min(6, t.height / 4)
  for (const type of ['dragEnter', 'dragOver', 'dragOver']) {
    await cdp.send('Input.dispatchDragEvent', { type, x: tx, y: ty, data })
    await p.waitForTimeout(80)
  }
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: tx, y: ty, data })
  await p.waitForTimeout(400)
  return { started: true }
}

async function fresh(browser, id, cookie) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const [name, value] = cookie.split('=')
  await ctx.addCookies([{ name, value, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
  await p.goto(`${BASE}/editor/g/${id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.ed-rail .ed-rail-item', { timeout: 40000 })
  await p.waitForSelector('.ed-section-head', { timeout: 40000 })
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Input.setInterceptDrags', { enabled: true })
  return { ctx, p, cdp, errs }
}


;(async () => {
  const { id, cookie } = await saveFixture()
  const browser = await chromium.launch()
  try {
    // ── 1. A whole section drags, and takes ITS OWN rounds with it ──
    {
      const { ctx, p, cdp, errs } = await fresh(browser, id, cookie)
      const before = await rail(p)
      console.log(`\n• A section, dragged by its header, to the bottom of the rail`)
      console.log(`  before: ${before.join(' | ')}`)
      const res = await drag(p, cdp, '.ed-section-head', '.ed-rail-list > *:last-child', 'bottom')
      ok(res.started, 'the section header actually starts a drag')
      const after = await rail(p)
      console.log(`  after:  ${after.join(' | ')}`)
      ok(after.join(' | ') === '[Warm up: AAA+BBB] | CCC | DDD' ? false : true, 'the rail changed at all')
      const sec = after.find((r) => r.startsWith('['))
      ok(!!sec && sec === '[Warm up: AAA+BBB]', `the section still holds ITS OWN two rounds (got ${sec})`)
      ok(after.filter((r) => r.startsWith('[')).length === 1, 'still one section, not split in two')
      ok(after.length === before.length, 'no round lost or stranded')
      ok(after.indexOf(sec) > 0, `the section actually moved down (row ${after.indexOf(sec)})`)
      ok(after.filter((r) => !r.startsWith('[')).join(',') === 'CCC,DDD', 'the loose rounds kept their order')
      ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`)
      await ctx.close()
    }

    // ── 2. The section drags back UP to the top ──
    {
      const { ctx, p, cdp, errs } = await fresh(browser, id, cookie)
      // First push it down, then drag it back, so we exercise both directions.
      await drag(p, cdp, '.ed-section-head', '.ed-rail-list > *:last-child', 'bottom')
      const mid = await rail(p)
      console.log(`\n• The same section, dragged back to the top`)
      console.log(`  before: ${mid.join(' | ')}`)
      const res = await drag(p, cdp, '.ed-section-head', '.ed-rail-list > *:first-child', 'top')
      ok(res.started, 'the header starts a drag a second time')
      const after = await rail(p)
      console.log(`  after:  ${after.join(' | ')}`)
      ok(after[0] === '[Warm up: AAA+BBB]', `the section is back on top with both rounds (got ${after[0]})`)
      ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`)
      await ctx.close()
    }

    // ── 3. A single round still drags on its own, OUT of the section ──
    {
      const { ctx, p, cdp, errs } = await fresh(browser, id, cookie)
      const before = await rail(p)
      console.log(`\n• One round, dragged out of the section by its own handle`)
      console.log(`  before: ${before.join(' | ')}`)
      const res = await drag(p, cdp, '.ed-section .ed-rail-item .ed-drag-handle', '.ed-rail-list > *:last-child', 'bottom')
      ok(res.started, 'a round row inside a section starts a drag')
      const after = await rail(p)
      console.log(`  after:  ${after.join(' | ')}`)
      ok(after.join(' | ') === '[Warm up: BBB] | CCC | DDD | AAA', `AAA left the section and landed last (got ${after.join(' | ')})`)
      ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`)
      await ctx.close()
    }

    // ── 4. A loose round drags INTO a section, which is how an author fills one ──
    {
      const { ctx, p, cdp, errs } = await fresh(browser, id, cookie)
      const before = await rail(p)
      console.log(`\n• A loose round, dragged INTO the section`)
      console.log(`  before: ${before.join(' | ')}`)
      const res = await drag(p, cdp, '.ed-rail-list > *:last-child .ed-drag-handle', '.ed-section .ed-rail-item:last-child', 'bottom')
      ok(res.started, 'a loose round starts a drag')
      const after = await rail(p)
      console.log(`  after:  ${after.join(' | ')}`)
      const sec = after.find((r) => r.startsWith('[')) ?? ''
      ok(sec.includes('DDD'), `DDD joined the section (section now ${sec})`)
      ok(after.filter((r) => r.startsWith('[')).length === 1, 'still one section')
      ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`)
      await ctx.close()
    }

    console.log(
      issues.length ? `\nEditor drag smoke FAILED:\n - ${issues.join('\n - ')}` : '\nEditor drag smoke PASSED',
    )
    if (issues.length) process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
