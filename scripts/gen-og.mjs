/**
 * Generate the default social-share (Open Graph) image at apps/web/public/og.png.
 *
 * A branded 1200x630 card rendered from an on-brand HTML template and screenshotted
 * with Playwright, so there's no runtime image-generation dependency: the PNG is
 * committed and served statically. Pages set per-page og:image (a game uses its cover);
 * everything else falls back to this card. Re-run after a brand/wording change:
 *
 *   node scripts/gen-og.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../apps/web/public/og.png')

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Figtree:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    font-family: 'Figtree', system-ui, sans-serif;
    background: linear-gradient(135deg, #fdf8ec 0%, #f5ebd3 55%, #f0e3c4 100%);
    color: #2a1d12;
    position: relative;
    overflow: hidden;
  }
  .dots { position: absolute; inset: 0;
    background-image: radial-gradient(rgba(42,29,18,.06) 2px, transparent 2.2px);
    background-size: 26px 26px; }
  .wrap { position: absolute; inset: 0; display: flex; align-items: center; padding: 72px; gap: 40px; }
  .left { flex: 1.15; min-width: 0; }
  .brand { display: inline-flex; align-items: center; gap: 12px; margin-bottom: 30px; }
  .logo { width: 56px; height: 56px; border-radius: 16px; background: #ff5a33;
    display: grid; place-items: center; box-shadow: 0 6px 0 rgba(42,29,18,.18); }
  .logo span { font-family: 'Baloo 2'; font-weight: 800; font-size: 34px; color: #fff; line-height: 1; }
  .wordmark { font-family: 'Baloo 2'; font-weight: 800; font-size: 40px; letter-spacing: -.02em; }
  h1 { font-family: 'Baloo 2'; font-weight: 800; font-size: 72px; line-height: 1.02;
    letter-spacing: -.02em; margin-bottom: 22px; }
  h1 .hl { color: #ff5a33; }
  p { font-size: 28px; line-height: 1.4; color: #6b5d4f; font-weight: 500; max-width: 620px; }
  .pill { position: absolute; bottom: 64px; left: 72px; display: inline-flex; align-items: center; gap: 10px;
    background: #2a1d12; color: #faf4e6; font-weight: 800; font-size: 24px; padding: 12px 22px; border-radius: 999px; }
  .pill i { width: 12px; height: 12px; border-radius: 50%; background: #16c8b5; }
  /* Right: a tilted big-screen mock with a question + answer bars */
  .screen { flex: .85; background: #fffdf7; border: 3px solid #2a1d12; border-radius: 24px;
    box-shadow: 14px 16px 0 rgba(42,29,18,.16); transform: rotate(3deg); overflow: hidden; }
  .scr-top { height: 40px; background: #f3e9d2; border-bottom: 3px solid #2a1d12; display: flex; align-items: center; gap: 8px; padding: 0 18px; }
  .scr-top i { width: 12px; height: 12px; border-radius: 50%; background: #d8c9a8; }
  .scr-body { padding: 26px 26px 30px; }
  .q { font-family: 'Baloo 2'; font-weight: 800; font-size: 30px; margin-bottom: 18px; }
  .opt { display: flex; align-items: center; gap: 12px; border: 3px solid #2a1d12; border-radius: 14px;
    padding: 12px 14px; margin-bottom: 12px; font-weight: 700; font-size: 22px; position: relative; overflow: hidden; }
  .opt b { width: 32px; height: 32px; border-radius: 9px; background: #f3e9d2; display: grid; place-items: center;
    font-family: 'Baloo 2'; flex: none; }
  .opt .fill { position: absolute; inset: 0 auto 0 0; background: rgba(255,90,51,.22); }
  .opt.win { background: #16c8b5; color: #04201c; border-color: #04201c; }
  .badges { position: absolute; bottom: 60px; right: 72px; display: flex; gap: 10px; }
  .chip { background: #fffdf7; border: 3px solid #2a1d12; border-radius: 999px; padding: 8px 16px;
    font-weight: 800; font-size: 20px; box-shadow: 4px 4px 0 rgba(42,29,18,.14); }
  .c2 { color: #5b79ff } .c3 { color: #ff73b3 } .c4 { color: #16c8b5 }
</style></head>
<body>
  <div class="dots"></div>
  <div class="wrap">
    <div class="left">
      <div class="brand">
        <span class="logo"><span>d</span></span>
        <span class="wordmark">doot</span>
      </div>
      <h1>Put a game on the <span class="hl">big screen.</span></h1>
      <p>Everyone joins from their phone. Trivia, drawing, polls, and party games, live in any room.</p>
    </div>
    <div class="screen">
      <div class="scr-top"><i></i><i></i><i></i></div>
      <div class="scr-body">
        <div class="q">Who is this character?</div>
        <div class="opt"><span class="fill" style="width:62%"></span><b>A</b><span>Sailor</span></div>
        <div class="opt win"><b>B</b><span>Knight</span></div>
        <div class="opt"><b>C</b><span>Witch</span></div>
      </div>
    </div>
  </div>
  <div class="pill"><i></i> doot.games</div>
  <div class="badges"><span class="chip c2">poll</span><span class="chip c3">draw</span><span class="chip c4">trivia</span></div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'networkidle' })
try {
  await page.evaluate(() => document.fonts.ready)
} catch {
  /* fonts API may be unavailable; system fallback is fine */
}
await page.waitForTimeout(400)
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log('wrote', out)
