/**
 * Generate cover art for the Games From Doot that ship without a hand-made cover.
 * Each cover is its OWN art-directed world (a poster from a different place and
 * decade: a typewriter desk, a casino table, a chalkboard, a deco radio), with a
 * period title lockup and one dimensional emblem, in the spirit of the covers
 * that set the bar (the luggage-label, enameled-die, and desert-dusk cards).
 * Never one template with swapped props.
 *
 * Self-contained HTML/CSS/SVG scenes rendered with Playwright at 1280x720 @2x
 * (2560x1440, 16:9), saved as JPEGs into apps/web/public/covers/<id>.jpg and
 * mapped once in packages/ui/src/covers.ts (FLAGSHIP_COVERS).
 *
 * Crop-safe rule (cards center-crop to a wide ~5:3 strip; heroes crop deeper):
 * every lockup + emblem stays inside the middle ~80% width x ~70% height.
 *
 *   node scripts/gen-covers.mjs            # all
 *   node scripts/gen-covers.mjs bingo ...  # specific ids
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../apps/web/public/covers')

function pageFor({ fonts, css, html }) {
  const fam = fonts.map((f) => `family=${encodeURIComponent(f).replace(/%3A/g, ':').replace(/%40/g, '@')}`).join('&')
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fam}&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1280px; height: 720px; }
  body { position: relative; overflow: hidden; }
  ${css}
</style></head><body>${html}</body></html>`
}

const COVERS = [
  {
    // A typewriter on a writer's desk: ink, paper, round keys with metal rims.
    id: 'type-the-answer',
    fonts: ['Special Elite', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 100% at 50% 20%, #27424a, #16282e 70%, #0d181c); font-family: 'Special Elite', monospace; }
      .grain { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1.4px); background-size: 7px 7px; opacity: .5; }
      .lock { position: absolute; top: 64px; left: 0; right: 0; text-align: center; color: #e8dcc3; }
      .lock h1 { font-size: 84px; letter-spacing: .02em; text-shadow: 0 3px 0 rgba(0,0,0,.5); }
      .lock .rule { width: 420px; height: 2px; margin: 14px auto 0; background: linear-gradient(90deg, transparent, #c9a86a, transparent); }
      .paper { position: absolute; left: 50%; top: 226px; transform: translateX(-50%) rotate(-1.2deg); width: 660px; height: 250px;
        background: linear-gradient(180deg, #f4ecd8, #e9dfc4); border-radius: 6px; box-shadow: 0 24px 50px rgba(0,0,0,.55), inset 0 0 60px rgba(133,105,53,.12); }
      .paper::before { content: ''; position: absolute; inset: 26px 30px auto; height: 0; border-top: 2px dashed rgba(90,70,40,.18); }
      .typed { position: absolute; left: 56px; top: 64px; font-size: 74px; color: #2c2317; letter-spacing: .08em; }
      .typed i { font-style: normal; color: #8c2f23; }
      .caret { display: inline-block; width: 34px; height: 8px; background: #2c2317; margin-left: 10px; vertical-align: baseline; }
      .underline { position: absolute; left: 56px; top: 160px; width: 430px; height: 5px; background: #8c2f23; border-radius: 3px; opacity: .8; }
      .keys { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); display: flex; gap: 24px; }
      .key { width: 84px; height: 84px; border-radius: 50%; position: relative;
        background: radial-gradient(circle at 36% 30%, #4d4d55, #17171c 70%); box-shadow: 0 10px 0 #060608, 0 16px 26px rgba(0,0,0,.6); }
      .key::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; border: 3px solid #b9b3a4; opacity: .9; }
      .key span { position: absolute; inset: 0; display: grid; place-items: center; color: #efe7d2; font-size: 36px; }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif;
        font-size: 22px; letter-spacing: .42em; color: #c9a86a; }
    `,
    html: `
      <div class="grain"></div>
      <div class="lock"><h1>Type the Answer</h1><div class="rule"></div></div>
      <div class="paper"><div class="typed">MERCUR<i>Y</i><span class="caret"></span></div><div class="underline"></div></div>
      <div class="keys"><div class="key"><span>Q</span></div><div class="key"><span>W</span></div><div class="key"><span>E</span></div><div class="key"><span>R</span></div><div class="key"><span>T</span></div></div>
      <div class="tag">NO CHOICES. JUST TYPE</div>`,
  },
  {
    // A carnival poster: two doors, harlequin halves, a gold ribbon OR.
    id: 'would-you-rather',
    fonts: ['Rye', 'Oswald:wght@600'],
    css: `
      body { font-family: 'Rye', serif; background: #1a0f14; }
      .half { position: absolute; top: 0; bottom: 0; width: 56%; }
      .hl { left: -6%; transform: skewX(-6deg); background: linear-gradient(180deg, #7e1f2d, #54141f);
        background-image: repeating-conic-gradient(from 45deg, rgba(255,255,255,.045) 0 25%, transparent 0 50%); background-size: 90px 90px; }
      .hr { right: -6%; transform: skewX(-6deg); background: linear-gradient(180deg, #134a4a, #0c3030);
        background-image: repeating-conic-gradient(from 45deg, rgba(255,255,255,.045) 0 25%, transparent 0 50%); background-size: 90px 90px; }
      .vig { position: absolute; inset: 0; background: radial-gradient(110% 90% at 50% 40%, transparent 45%, rgba(0,0,0,.6)); }
      .lock { position: absolute; top: 56px; left: 0; right: 0; text-align: center; color: #f3e2b8;
        text-shadow: 0 3px 0 #3a1208, 0 8px 18px rgba(0,0,0,.6); }
      .lock h1 { font-size: 78px; }
      .door { position: absolute; top: 250px; width: 240px; height: 330px; border-radius: 120px 120px 10px 10px;
        border: 8px solid #c9a86a; box-shadow: 0 18px 40px rgba(0,0,0,.55), inset 0 0 50px rgba(0,0,0,.5); }
      .d1 { left: 200px; background: linear-gradient(180deg, #a33042, #5d1626); }
      .d2 { right: 200px; background: linear-gradient(180deg, #1d6b66, #0d3a38); }
      .door b { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); font-size: 120px; color: #f3e2b8; text-shadow: 0 4px 0 rgba(0,0,0,.45); }
      .door::after { content: ''; position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); width: 18px; height: 18px; border-radius: 50%; background: #c9a86a; box-shadow: 0 3px 6px rgba(0,0,0,.6); }
      .ribbon { position: absolute; left: 50%; top: 380px; transform: translateX(-50%) rotate(-3deg); background: linear-gradient(180deg, #e7c277, #c9a14f);
        color: #4a2c08; font-size: 64px; padding: 10px 46px; box-shadow: 0 12px 26px rgba(0,0,0,.5);
        clip-path: polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif;
        font-size: 22px; letter-spacing: .42em; color: #c9a86a; }
    `,
    html: `
      <div class="half hl"></div><div class="half hr"></div><div class="vig"></div>
      <div class="lock"><h1>Would You Rather</h1></div>
      <div class="door d1"><b>1</b></div><div class="door d2"><b>2</b></div>
      <div class="ribbon">OR</div>
      <div class="tag">PICK A SIDE. DEFEND IT</div>`,
  },
  {
    // An awards-gala poster: black and gold, a trophy over the S podium.
    id: 'tier-list',
    fonts: ['Cinzel:wght@700;900', 'Oswald:wght@600'],
    css: `
      body { font-family: 'Cinzel', serif; background: radial-gradient(120% 110% at 50% 0%, #2c2618, #14110a 60%, #0a0906); }
      .rays { position: absolute; inset: -20%; background: repeating-conic-gradient(from -90deg at 50% 40%, rgba(214,178,94,.07) 0 6deg, transparent 6deg 14deg); }
      .lock { position: absolute; top: 58px; left: 0; right: 0; text-align: center; }
      .lock h1 { font-size: 86px; font-weight: 900; background: linear-gradient(180deg, #f4dfa4, #c9a14f 60%, #8c6c2a);
        -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: .04em; }
      .lock .sub { margin-top: 4px; color: #b59c66; font-family: 'Oswald', sans-serif; font-size: 20px; letter-spacing: .5em; }
      .trophy { position: absolute; left: 50%; top: 218px; transform: translateX(-50%); width: 230px; height: 200px; }
      .cup { position: absolute; left: 50%; transform: translateX(-50%); width: 150px; height: 110px; border-radius: 0 0 80px 80px;
        background: linear-gradient(105deg, #f4dfa4 10%, #c9a14f 45%, #8c6c2a 80%); box-shadow: inset -10px -8px 18px rgba(0,0,0,.35), 0 8px 22px rgba(0,0,0,.5); }
      .cup::before, .cup::after { content: ''; position: absolute; top: 8px; width: 54px; height: 64px; border: 12px solid #c9a14f; border-radius: 50%; }
      .cup::before { left: -52px; border-right-color: transparent; transform: rotate(-12deg); }
      .cup::after { right: -52px; border-left-color: transparent; transform: rotate(12deg); }
      .stem { position: absolute; left: 50%; top: 108px; transform: translateX(-50%); width: 34px; height: 36px; background: linear-gradient(90deg, #8c6c2a, #e7c277, #8c6c2a); }
      .base { position: absolute; left: 50%; top: 142px; transform: translateX(-50%); width: 120px; height: 26px; border-radius: 6px; background: linear-gradient(90deg, #6d5320, #c9a14f, #6d5320); box-shadow: 0 10px 20px rgba(0,0,0,.5); }
      .podium { position: absolute; left: 50%; bottom: 88px; transform: translateX(-50%); display: flex; align-items: flex-end; gap: 8px; }
      .step { width: 170px; background: linear-gradient(180deg, #241e10, #171307); border: 2px solid #4a3c1c; border-bottom: none;
        display: grid; place-items: center; color: #c9a14f; font-weight: 900; font-size: 48px; box-shadow: inset 0 14px 22px rgba(0,0,0,.4); }
      .s1 { height: 120px; border-color: #c9a14f; color: #f4dfa4; box-shadow: inset 0 14px 22px rgba(0,0,0,.4), 0 0 38px rgba(214,178,94,.25); }
      .s2 { height: 86px; } .s3 { height: 62px; font-size: 38px; }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #b59c66; }
    `,
    html: `
      <div class="rays"></div>
      <div class="lock"><h1>TIER LIST</h1><div class="sub">THE RANKINGS ARE FINAL</div></div>
      <div class="trophy"><div class="cup"></div><div class="stem"></div><div class="base"></div></div>
      <div class="podium"><div class="step s2">A</div><div class="step s1">S</div><div class="step s3">B</div></div>
      <div class="tag">EVERYTHING GETS RANKED</div>`,
  },
  {
    // A casino odds board on green felt: split-flap digits, brass arrows.
    id: 'over-under',
    fonts: ['Oswald:wght@500;700', 'Playfair Display:wght@800'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 30%, #1d5438, #123924 60%, #0a2415); font-family: 'Playfair Display', serif; }
      .felt { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.035) 1px, transparent 1.3px); background-size: 6px 6px; }
      .lock { position: absolute; top: 56px; left: 0; right: 0; text-align: center; color: #efe3bd; }
      .lock h1 { font-size: 84px; font-weight: 800; text-shadow: 0 3px 0 rgba(0,0,0,.45); }
      .lock .rule { width: 380px; height: 3px; margin: 10px auto 0; background: linear-gradient(90deg, transparent, #c9a86a, transparent); }
      .board { position: absolute; left: 50%; top: 250px; transform: translateX(-50%); background: #11100e; border: 6px solid #2c2a24;
        border-radius: 18px; padding: 26px 30px; display: flex; gap: 12px; box-shadow: 0 24px 50px rgba(0,0,0,.55); }
      .flap { width: 84px; height: 120px; border-radius: 10px; background: linear-gradient(180deg, #2a2a2e 48%, #1c1c20 52%);
        display: grid; place-items: center; color: #f3e9cf; font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 78px;
        box-shadow: inset 0 2px 0 rgba(255,255,255,.08); position: relative; }
      .flap::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 3px; background: #0a0a0c; }
      .arrow { position: absolute; top: 268px; width: 0; height: 0; border-left: 64px solid transparent; border-right: 64px solid transparent; }
      .up { left: 128px; border-bottom: 100px solid #57c785; filter: drop-shadow(0 12px 18px rgba(0,0,0,.5)); }
      .upStem { position: absolute; left: 176px; top: 368px; width: 32px; height: 56px; background: #57c785; box-shadow: 0 12px 18px rgba(0,0,0,.4); }
      .down { right: 128px; top: 324px; border-top: 100px solid #d8625a; filter: drop-shadow(0 12px 18px rgba(0,0,0,.5)); }
      .downStem { position: absolute; right: 176px; top: 268px; width: 32px; height: 56px; background: #d8625a; box-shadow: 0 12px 18px rgba(0,0,0,.4); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #c9a86a; }
    `,
    html: `
      <div class="felt"></div>
      <div class="lock"><h1>Over / Under</h1><div class="rule"></div></div>
      <div class="upStem"></div><div class="arrow up"></div>
      <div class="downStem"></div><div class="arrow down"></div>
      <div class="board"><div class="flap">2</div><div class="flap">0</div><div class="flap">0</div><div class="flap">0</div><div class="flap">?</div></div>
      <div class="tag">IS THE TRUTH ABOVE THE LINE</div>`,
  },
  {
    // A classroom chalkboard in a wooden frame, chalk handwriting and dust.
    id: 'categories',
    fonts: ['Patrick Hand', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 30%, #2e4438, #22332a 65%, #182520); font-family: 'Patrick Hand', cursive; }
      .frame { position: absolute; inset: 0; border: 26px solid #6d4a2a; border-radius: 8px;
        box-shadow: inset 0 0 0 6px #8a6038, inset 0 0 80px rgba(0,0,0,.5); }
      .dust { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1.6px); background-size: 9px 9px; opacity: .7; }
      .lock { position: absolute; top: 54px; left: 0; right: 0; text-align: center; color: #f2efe4; }
      .lock h1 { font-size: 96px; text-shadow: 0 0 14px rgba(242,239,228,.25); }
      .lock .under { width: 430px; height: 5px; margin: -6px auto 0; border-radius: 3px;
        background: linear-gradient(90deg, transparent, rgba(242,239,228,.7) 20% 80%, transparent); transform: rotate(-.6deg); }
      .letter { position: absolute; left: 200px; top: 250px; width: 240px; height: 240px; }
      .letter .ring { position: absolute; inset: 0; border: 7px dashed rgba(255,210,120,.85); border-radius: 50%; transform: rotate(-8deg); }
      .letter b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 170px; color: #ffd278; text-shadow: 0 0 18px rgba(255,210,120,.35); }
      .list { position: absolute; right: 190px; top: 252px; color: #e9e6da; font-size: 50px; line-height: 1.5; transform: rotate(-1deg); }
      .list i { font-style: normal; color: #9fd8c0; }
      .chalk { position: absolute; left: 230px; bottom: 64px; width: 110px; height: 22px; border-radius: 10px; background: linear-gradient(180deg, #fdfaf0, #d9d4c2); transform: rotate(-12deg); box-shadow: 0 8px 14px rgba(0,0,0,.45); }
      .tag { position: absolute; bottom: 38px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #cdbf9a; }
    `,
    html: `
      <div class="dust"></div>
      <div class="lock"><h1>Categories</h1><div class="under"></div></div>
      <div class="letter"><div class="ring"></div><b>R</b></div>
      <div class="list">a city<i>...</i><br>a snack<i>...</i><br>an excuse<i>...</i></div>
      <div class="chalk"></div>
      <div class="frame"></div>
      <div class="tag">ONE LETTER. NO REPEATS</div>`,
  },
  {
    // A 1970s game-show set: sunburst rays, a bulb-rimmed answer board.
    id: 'survey',
    fonts: ['Alfa Slab One', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(130% 120% at 50% 115%, #b4571f, #8a3c16 45%, #4f1f0c 80%, #2e1106); font-family: 'Alfa Slab One', serif; }
      .rays { position: absolute; inset: -30%; background: repeating-conic-gradient(from 0deg at 50% 115%, rgba(255,205,120,.12) 0 7deg, transparent 7deg 15deg); }
      .lock { position: absolute; top: 50px; left: 0; right: 0; text-align: center; }
      .lock h1 { font-size: 96px; color: #ffe9c2; text-shadow: 0 5px 0 #5e2a10, 0 12px 24px rgba(0,0,0,.45); letter-spacing: .02em; }
      .board { position: absolute; left: 50%; top: 226px; transform: translateX(-50%); width: 700px; border-radius: 34px;
        background: #20150e; padding: 28px; box-shadow: 0 24px 50px rgba(0,0,0,.55), inset 0 0 0 4px #3b2415; }
      .bulbs { position: absolute; inset: 10px; border-radius: 26px; pointer-events: none;
        background-image: radial-gradient(circle, #ffd887 4px, #d8a040 5px, transparent 6.5px); background-size: 46px 46px; background-position: 12px 0;
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; padding: 14px; opacity: .95; }
      .slat { height: 78px; border-radius: 14px; margin: 10px 0; display: flex; align-items: center; justify-content: space-between;
        padding: 0 26px; font-size: 40px; }
      .open { background: linear-gradient(180deg, #2f5fae, #1d3d77); color: #ffe9c2; box-shadow: inset 0 3px 0 rgba(255,255,255,.18); }
      .shut { background: linear-gradient(180deg, #31231a, #241811); color: #d8a040; justify-content: center; box-shadow: inset 0 3px 0 rgba(255,255,255,.06); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #ffce8a; }
    `,
    html: `
      <div class="rays"></div>
      <div class="lock"><h1>SURVEY</h1></div>
      <div class="board">
        <div class="bulbs"></div>
        <div class="slat open"><span>PIZZA</span><span>38</span></div>
        <div class="slat shut">2</div>
        <div class="slat shut">3</div>
      </div>
      <div class="tag">TOP ANSWERS ON THE BOARD</div>`,
  },
  {
    // A neon meter: this game's world IS the glowing gauge.
    id: 'spectrum',
    fonts: ['Baloo 2:wght@800', 'Figtree:wght@800'],
    css: `
      body { background: radial-gradient(120% 100% at 50% 30%, #181327, #0c0a12 70%); font-family: 'Baloo 2', sans-serif; }
      .lock { position: absolute; top: 56px; left: 0; right: 0; text-align: center; font-weight: 800; font-size: 88px; }
      .lock .a { color: #4be1ff; text-shadow: 0 0 34px #4be1ff66; } .lock .b { color: #ff5fa8; text-shadow: 0 0 34px #ff5fa866; }
      svg { position: absolute; left: 50%; top: 168px; transform: translateX(-50%); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Figtree', sans-serif; font-size: 23px; letter-spacing: .4em; color: #ffc943; font-weight: 800; }
    `,
    html: `
      <div class="lock"><span class="a">Spec</span><span class="b">trum</span></div>
      <svg width="900" height="430" viewBox="0 0 900 430">
        <defs><linearGradient id="arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#4be1ff"/><stop offset=".5" stop-color="#b18cff"/><stop offset="1" stop-color="#ff5fa8"/>
        </linearGradient></defs>
        <path d="M 130 400 A 320 320 0 0 1 770 400" fill="none" stroke="url(#arc)" stroke-width="60" stroke-linecap="round" opacity=".92"/>
        <path d="M 130 400 A 320 320 0 0 1 770 400" fill="none" stroke="#0c0a12" stroke-width="18" stroke-dasharray="2 54" opacity=".8"/>
        <path d="M 620 132 A 320 320 0 0 1 716 262 L 450 400 Z" fill="#ffffff" opacity=".14"/>
        <g transform="rotate(36 450 400)">
          <rect x="442" y="100" width="16" height="276" rx="8" fill="#ffc943" filter="drop-shadow(0 0 16px #ffc943)"/>
          <circle cx="450" cy="400" r="32" fill="#ffc943" filter="drop-shadow(0 0 20px #ffc943)"/>
        </g>
      </svg>
      <div class="tag">READ THE ROOM</div>`,
  },
  {
    // Casino noir: emerald felt, dimensional chips, fanned cards, a gold plate.
    id: 'wager',
    fonts: ['Playfair Display:wght@800;900', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 25%, #14443a, #0d2e27 60%, #071b16); font-family: 'Playfair Display', serif; }
      .felt { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.035) 1px, transparent 1.3px); background-size: 6px 6px; }
      .lock { position: absolute; top: 52px; left: 0; right: 0; text-align: center; }
      .lock h1 { font-size: 96px; font-weight: 900; background: linear-gradient(180deg, #f4dfa4, #c9a14f 65%, #8c6c2a);
        -webkit-background-clip: text; background-clip: text; color: transparent; }
      .lock .sub { color: #9fbfae; font-family: 'Oswald', sans-serif; font-size: 20px; letter-spacing: .5em; margin-top: 2px; }
      .card { position: absolute; width: 170px; height: 240px; border-radius: 16px; background: linear-gradient(180deg, #f8f4e6, #e9e2cc);
        box-shadow: 0 18px 36px rgba(0,0,0,.5); display: grid; place-items: center; font-size: 92px; }
      .c1 { left: 420px; top: 250px; transform: rotate(-9deg); color: #1d1d22; }
      .c2 { left: 540px; top: 240px; transform: rotate(7deg); color: #a02a26; }
      .chipstack { position: absolute; bottom: 104px; }
      .chip { position: absolute; width: 150px; height: 44px; border-radius: 50%; }
      .chip i { position: absolute; inset: 0; border-radius: 50%; border: 5px dashed rgba(255,255,255,.7); transform: scale(.82, .72); }
      .st1 { left: 200px; } .st2 { right: 215px; }
      .r { background: radial-gradient(circle at 40% 30%, #c84f49, #8c2622); box-shadow: 0 6px 12px rgba(0,0,0,.45); }
      .b { background: radial-gradient(circle at 40% 30%, #3a66b8, #1f3a73); box-shadow: 0 6px 12px rgba(0,0,0,.45); }
      .g { background: radial-gradient(circle at 40% 30%, #e7c277, #a8801f); box-shadow: 0 6px 12px rgba(0,0,0,.45); }
      .plate { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%) rotate(-2deg); padding: 10px 38px;
        background: linear-gradient(180deg, #f4dfa4, #c9a14f); color: #4a2c08; border-radius: 12px; font-weight: 900; font-size: 56px;
        box-shadow: 0 14px 30px rgba(0,0,0,.55), inset 0 2px 0 rgba(255,255,255,.55); }
      .tag { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #c9a86a; }
    `,
    html: `
      <div class="felt"></div>
      <div class="lock"><h1>Wager</h1><div class="sub">HIGH-STAKES TRIVIA</div></div>
      <div class="card c1">♠</div><div class="card c2">♥</div>
      <div class="chipstack st1">
        <div class="chip r" style="bottom:0"><i></i></div><div class="chip r" style="bottom:24px"><i></i></div>
        <div class="chip g" style="bottom:48px"><i></i></div><div class="chip r" style="bottom:72px"><i></i></div>
      </div>
      <div class="chipstack st2">
        <div class="chip b" style="bottom:0"><i></i></div><div class="chip b" style="bottom:24px"><i></i></div>
        <div class="chip g" style="bottom:48px"><i></i></div>
      </div>
      <div class="plate">500</div>
      <div class="tag">BET BIG. WIN BIGGER</div>`,
  },
  {
    // A storybook: parchment, an inked opening line, wax-sealed letters.
    id: 'story-chain',
    fonts: ['Playfair Display:wght@800', 'Caveat:wght@600', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(115% 105% at 50% 30%, #efe2c2, #e2cf9f 60%, #c9af78); font-family: 'Playfair Display', serif; }
      .blotch { position: absolute; inset: 0; background:
        radial-gradient(180px 120px at 14% 20%, rgba(140,105,45,.12), transparent 70%),
        radial-gradient(220px 160px at 88% 78%, rgba(140,105,45,.14), transparent 70%),
        radial-gradient(140px 100px at 78% 12%, rgba(140,105,45,.1), transparent 70%); }
      .border { position: absolute; inset: 24px; border: 3px double #8a6a32; border-radius: 10px; opacity: .7; }
      .lock { position: absolute; top: 58px; left: 0; right: 0; text-align: center; color: #4a3413; }
      .lock h1 { font-size: 88px; font-weight: 800; }
      .lock .orn { color: #8a6a32; font-size: 26px; letter-spacing: .6em; margin-top: 2px; }
      .line { position: absolute; left: 50%; top: 230px; transform: translateX(-50%) rotate(-1deg);
        font-family: 'Caveat', cursive; font-size: 66px; color: #3d2c10; white-space: nowrap; }
      .line i { font-style: normal; color: #a02a26; }
      .chain { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); display: flex; align-items: center; gap: 34px; }
      .env { width: 190px; height: 126px; background: linear-gradient(180deg, #faf3df, #ecdfbc); border: 2px solid #c4a86f;
        border-radius: 8px; position: relative; box-shadow: 0 14px 26px rgba(90,60,20,.35); }
      .env::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 0;
        border-left: 93px solid transparent; border-right: 93px solid transparent; border-top: 62px solid #e2d2a8; }
      .env b { position: absolute; left: 50%; top: 48px; transform: translateX(-50%); width: 42px; height: 42px; border-radius: 50%;
        background: radial-gradient(circle at 38% 32%, #c0463f, #7c1f1a); box-shadow: 0 4px 8px rgba(0,0,0,.35); }
      .arrowd { width: 60px; height: 6px; background: repeating-linear-gradient(90deg, #8a6a32 0 12px, transparent 12px 22px); }
      .env.r1 { transform: rotate(-4deg); } .env.r2 { transform: rotate(3deg); }
      .tag { position: absolute; bottom: 38px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #6d5320; }
    `,
    html: `
      <div class="blotch"></div><div class="border"></div>
      <div class="lock"><h1>Story Chain</h1><div class="orn">&#9670; &#9670; &#9670;</div></div>
      <div class="line">"Once upon a time, <i>a llama ran for mayor...</i>"</div>
      <div class="chain"><div class="env r1"><b></b></div><div class="arrowd"></div><div class="env r2"><b></b></div><div class="arrowd"></div><div class="env r1"><b></b></div></div>
      <div class="tag">ONE LINE AT A TIME</div>`,
  },
  {
    // A corkboard of pinned papers: prompt note, crayon drawing, mystery note.
    id: 'doodle-chain',
    fonts: ['Shantell Sans:wght@700;800', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 25%, #9a6b40, #7c5430 60%, #5d3e22); font-family: 'Shantell Sans', cursive; }
      .cork { position: absolute; inset: 0; background-image: radial-gradient(rgba(0,0,0,.14) 2px, transparent 2.6px), radial-gradient(rgba(255,255,255,.08) 1.4px, transparent 2px);
        background-size: 26px 26px, 17px 17px; background-position: 0 0, 9px 7px; }
      .frame { position: absolute; inset: 0; border: 20px solid #4a3018; box-shadow: inset 0 0 60px rgba(0,0,0,.4); }
      .lock { position: absolute; top: 48px; left: 0; right: 0; text-align: center; font-weight: 800; font-size: 86px; color: #fdf6e9;
        text-shadow: 0 4px 0 rgba(58,34,12,.55); }
      .lock .d1 { color: #ffd84d; } .lock .d2 { color: #7fe3d2; }
      .pin { position: absolute; width: 26px; height: 26px; border-radius: 50%; box-shadow: 0 4px 7px rgba(0,0,0,.45); z-index: 5; }
      .note { position: absolute; padding: 22px 26px; font-size: 34px; box-shadow: 0 16px 28px rgba(0,0,0,.4); }
      .n1 { left: 130px; top: 250px; background: #ffd84d; color: #5a3c08; transform: rotate(-5deg); }
      .n2 { right: 138px; top: 262px; background: #7fe3d2; color: #0d4a3e; transform: rotate(5deg); font-size: 64px; padding: 14px 36px; }
      .sheet { position: absolute; left: 50%; top: 218px; transform: translateX(-50%) rotate(1.5deg); width: 330px; height: 300px;
        background: #fdfaf2; box-shadow: 0 18px 34px rgba(0,0,0,.45); }
      .tag { position: absolute; bottom: 38px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .38em; color: #ffd84d; }
    `,
    html: `
      <div class="cork"></div>
      <div class="lock"><span class="d1">Doodle</span> <span class="d2">Chain</span></div>
      <div class="note n1">a cat wedding</div>
      <div class="sheet">
        <svg viewBox="0 0 330 300" style="width:100%;height:100%">
          <g fill="none" stroke-linecap="round">
            <circle cx="165" cy="128" r="58" stroke="#e2536e" stroke-width="9"/>
            <path d="M124 86 L110 48 L146 72" stroke="#e2536e" stroke-width="9"/>
            <path d="M206 86 L220 48 L184 72" stroke="#e2536e" stroke-width="9"/>
            <path d="M147 122 l3 3 M180 122 l3 3" stroke="#3a66b8" stroke-width="12"/>
            <path d="M150 152 q 15 14 30 0" stroke="#3a66b8" stroke-width="8"/>
            <path d="M118 226 q 47 28 94 0" stroke="#57b85f" stroke-width="8" stroke-dasharray="3 14"/>
            <path d="M96 252 q 70 22 138 0" stroke="#e8a33c" stroke-width="8"/>
          </g>
        </svg>
      </div>
      <div class="note n2">??</div>
      <div class="pin" style="left:218px; top:242px; background:#d8625a"></div>
      <div class="pin" style="left:50%; top:206px; background:#3a66b8"></div>
      <div class="pin" style="right:200px; top:252px; background:#57b85f"></div>
      <div class="tag">DRAW IT. GUESS IT. PASS IT ON</div>`,
  },
  {
    // An art-deco wireless set: walnut cabinet, brass tuner dial, grille slats.
    id: 'wavelength',
    fonts: ['Limelight', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #4a2c16 0%, #38200f 45%, #241406 100%); font-family: 'Limelight', serif; }
      .wood { position: absolute; inset: 0; background: repeating-linear-gradient(94deg, rgba(0,0,0,.12) 0 3px, transparent 3px 18px), repeating-linear-gradient(2deg, rgba(255,200,120,.05) 0 2px, transparent 2px 26px); }
      .lock { position: absolute; top: 54px; left: 0; right: 0; text-align: center; }
      .lock h1 { font-size: 86px; background: linear-gradient(180deg, #f0d9a0, #c9a14f 60%, #8c6c2a);
        -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: .03em; }
      .lock .sub { color: #b08d52; font-family: 'Oswald', sans-serif; font-size: 19px; letter-spacing: .55em; margin-top: 4px; }
      .dialwrap { position: absolute; left: 50%; top: 222px; transform: translateX(-50%); width: 520px; height: 290px;
        border-radius: 260px 260px 14px 14px; background: linear-gradient(180deg, #2b1a0c, #1c1106); border: 8px solid #c9a14f;
        box-shadow: 0 24px 48px rgba(0,0,0,.55), inset 0 0 50px rgba(0,0,0,.6); overflow: hidden; }
      .face { position: absolute; inset: 22px 22px 0; border-radius: 240px 240px 0 0; background: radial-gradient(140% 130% at 50% 100%, #f3e7c6, #e2cf9f 70%); }
      svg { position: absolute; inset: 0; }
      .grille { position: absolute; top: 300px; width: 120px; height: 190px; border-radius: 16px; background: repeating-linear-gradient(0deg, #c9a14f 0 10px, #2b1a0c 10px 26px); box-shadow: 0 14px 28px rgba(0,0,0,.5); opacity: .92; }
      .gl { left: 132px; } .gr { right: 132px; }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #c9a86a; }
    `,
    html: `
      <div class="wood"></div>
      <div class="lock"><h1>WAVELENGTH</h1><div class="sub">TUNE INTO EACH OTHER</div></div>
      <div class="grille gl"></div><div class="grille gr"></div>
      <div class="dialwrap"><div class="face">
        <svg viewBox="0 0 520 290">
          <g stroke="#6d5320" stroke-width="4">
            ${Array.from({ length: 13 }, (_, i) => {
              const ang = (Math.PI * (i + 1)) / 14
              const x1 = 260 - Math.cos(ang) * 200
              const y1 = 280 - Math.sin(ang) * 200
              const x2 = 260 - Math.cos(ang) * 174
              const y2 = 280 - Math.sin(ang) * 174
              return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
            }).join('')}
          </g>
          <path d="M 354 113 A 192 192 0 0 1 426 211 L 260 280 Z" fill="#c0463f" opacity=".85"/>
          <g transform="rotate(28 260 280)">
            <rect x="253" y="96" width="14" height="184" rx="7" fill="#2b1a0c"/>
          </g>
          <circle cx="260" cy="280" r="34" fill="#c9a14f" stroke="#8c6c2a" stroke-width="4"/>
        </svg>
      </div></div>
      <div class="tag">FIND THE HIDDEN POINT</div>`,
  },
  {
    // A bingo-parlor poster: cherry red, bunting, a ball cage and lucky balls.
    id: 'bingo',
    fonts: ['Lilita One', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 20%, #a8312b, #7c1f1e 60%, #561312); font-family: 'Lilita One', sans-serif; }
      .dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,235,200,.09) 4px, transparent 5px); background-size: 56px 56px; }
      .lock { position: absolute; top: 44px; left: 0; right: 0; text-align: center; }
      .lock h1 { font-size: 110px; color: #ffe9c2; text-shadow: 0 6px 0 #4a0e0d, 0 14px 28px rgba(0,0,0,.45); }
      .lock h1 i { font-style: normal; display: inline-block; }
      .lock h1 i:nth-child(2) { transform: rotate(4deg) translateY(-6px); color: #ffd84d; }
      .lock h1 i:nth-child(4) { transform: rotate(-4deg) translateY(-4px); color: #7fe3d2; }
      .cage { position: absolute; left: 308px; top: 250px; width: 300px; height: 300px; border-radius: 50%;
        border: 10px solid #e7c277; box-shadow: inset 0 0 0 4px rgba(0,0,0,.25), 0 20px 40px rgba(0,0,0,.45); overflow: hidden;
        background: radial-gradient(circle at 40% 30%, rgba(255,255,255,.12), transparent 60%); }
      .cage::before, .cage::after { content: ''; position: absolute; inset: -10px; border-radius: 50%; border: 6px solid rgba(231,194,119,.65); }
      .cage::before { transform: scaleX(.55); } .cage::after { transform: scaleX(.18); }
      .ball { position: absolute; border-radius: 50%; display: grid; place-items: center; font-size: 36px; color: #fff;
        text-shadow: 0 2px 0 rgba(0,0,0,.35); box-shadow: inset -8px -10px 16px rgba(0,0,0,.3), 0 10px 18px rgba(0,0,0,.4); }
      .ball::before { content: ''; position: absolute; left: 18%; top: 12%; width: 32%; height: 24%; border-radius: 50%; background: rgba(255,255,255,.45); filter: blur(2px); }
      .b1 { width: 110px; height: 110px; left: 358px; top: 400px; background: radial-gradient(circle at 38% 30%, #4f86d8, #1f3a73); }
      .b2 { width: 96px; height: 96px; left: 458px; top: 330px; background: radial-gradient(circle at 38% 30%, #e8a33c, #9c5d12); }
      .b3 { width: 120px; height: 120px; left: 660px; top: 300px; background: radial-gradient(circle at 38% 30%, #57b85f, #1f6b32); font-size: 46px; }
      .b4 { width: 104px; height: 104px; left: 760px; top: 408px; background: radial-gradient(circle at 38% 30%, #c84f49, #79201c); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #ffd9a0; }
    `,
    html: `
      <div class="dots"></div>
      <div class="lock"><h1><i>B</i><i>I</i><i>N</i><i>G</i><i>O</i><i>!</i></h1></div>
      <div class="cage"></div>
      <div class="ball b1">7</div>
      <div class="ball b2">23</div>
      <div class="ball b3">51</div>
      <div class="ball b4">12</div>
      <div class="tag">FIRST LINE WINS</div>`,
  },
  {
    // A stadium scoreboard at night: floodlights, amber segments, a stamp.
    id: 'call-it',
    fonts: ['Graduate', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #0c1424 0%, #101b30 55%, #15301d 88%, #1a4023 100%); font-family: 'Graduate', serif; }
      .flood { position: absolute; top: -40px; width: 560px; height: 480px; background: radial-gradient(50% 60% at 50% 0%, rgba(220,235,255,.16), transparent 70%); }
      .f1 { left: -60px; } .f2 { right: -60px; }
      .mast { position: absolute; top: 26px; width: 90px; height: 28px; border-radius: 6px; background: #0a0e18; box-shadow: 0 0 26px rgba(220,235,255,.5); }
      .mast i { position: absolute; inset: 5px; border-radius: 4px; background: repeating-linear-gradient(90deg, #dceaff 0 14px, #0a0e18 14px 20px); }
      .m1 { left: 110px; } .m2 { right: 110px; }
      .lock { position: absolute; top: 64px; left: 0; right: 0; text-align: center; color: #f2f6ff; }
      .lock h1 { font-size: 92px; letter-spacing: .04em; text-shadow: 0 4px 0 #060a12, 0 0 30px rgba(220,235,255,.25); }
      .board { position: absolute; left: 50%; top: 232px; transform: translateX(-50%); width: 660px; border-radius: 22px;
        background: #0a0e16; border: 6px solid #2a3246; padding: 26px 30px; box-shadow: 0 26px 52px rgba(0,0,0,.6); }
      .row { display: flex; align-items: center; gap: 22px; margin-bottom: 20px; }
      .row:last-child { margin-bottom: 0; }
      .lbl { width: 130px; font-size: 44px; }
      .yes { color: #57c785; text-shadow: 0 0 18px #57c78566; } .no { color: #d8625a; text-shadow: 0 0 18px #d8625a66; }
      .bar { height: 40px; border-radius: 8px; background: repeating-linear-gradient(90deg, currentColor 0 26px, rgba(0,0,0,.55) 26px 32px); }
      .num { margin-left: auto; font-size: 52px; color: #ffce5a; text-shadow: 0 0 20px #ffce5a66; font-family: 'Oswald', sans-serif; font-weight: 600; }
      .stamp { position: absolute; right: 120px; top: 360px; transform: rotate(-10deg); padding: 12px 30px; border: 6px solid #ffce5a;
        border-radius: 14px; color: #ffce5a; font-size: 46px; text-shadow: 0 0 22px #ffce5a88; box-shadow: 0 0 40px #ffce5a33, inset 0 0 24px #ffce5a1c; background: rgba(8,10,16,.82); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: .42em; color: #9fb4d8; }
    `,
    html: `
      <div class="flood f1"></div><div class="flood f2"></div>
      <div class="mast m1"><i></i></div><div class="mast m2"><i></i></div>
      <div class="lock"><h1>CALL IT</h1></div>
      <div class="board">
        <div class="row yes"><span class="lbl">YES</span><div class="bar" style="width:300px"></div><span class="num">7</span></div>
        <div class="row no"><span class="lbl">NO</span><div class="bar" style="width:130px"></div><span class="num">3</span></div>
      </div>
      <div class="stamp">CALLED IT</div>
      <div class="tag">PREDICT THE MOMENT</div>`,
  },
  {
    // A fight-night bill: aged woodtype poster, two glove speech bubbles square off.
    id: 'quip-clash',
    fonts: ['Bevan', 'Oswald:wght@600;700'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 30%, #f0e4c6, #e4d3a8 60%, #cdb781); font-family: 'Bevan', serif; }
      .grain { position: absolute; inset: 0; background-image: radial-gradient(rgba(80,50,20,.08) 1px, transparent 1.4px); background-size: 5px 5px; }
      .bord { position: absolute; inset: 22px; border: 4px solid #2a201a; }
      .top { position: absolute; top: 44px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 700;
        font-size: 24px; letter-spacing: .5em; color: #b3322b; }
      .lock { position: absolute; top: 76px; left: 0; right: 0; text-align: center; color: #2a201a; }
      .lock h1 { font-size: 96px; line-height: 1; text-shadow: 4px 4px 0 #b3322b33; }
      .star { position: absolute; top: 58px; width: 34px; height: 34px; background: #b3322b;
        clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
      .bub { position: absolute; top: 280px; width: 330px; height: 200px; border-radius: 40px; border: 7px solid #2a201a;
        display: grid; place-items: center; font-size: 80px; box-shadow: 10px 12px 0 #2a201a22; }
      .bl { left: 130px; background: #b3322b; color: #f0e4c6; transform: rotate(-3deg); }
      .bl::after { content: ''; position: absolute; bottom: -34px; left: 60px; border: 16px solid transparent; border-top: 30px solid #2a201a; }
      .br { right: 130px; background: #27506b; color: #f0e4c6; transform: rotate(3deg); }
      .br::after { content: ''; position: absolute; bottom: -34px; right: 60px; border: 16px solid transparent; border-top: 30px solid #2a201a; }
      .vs { position: absolute; left: 50%; top: 348px; transform: translateX(-50%) rotate(-4deg); font-size: 76px; color: #2a201a;
        background: #e9b63c; border: 6px solid #2a201a; border-radius: 50%; width: 150px; height: 150px; display: grid; place-items: center;
        box-shadow: 8px 10px 0 #2a201a33; z-index: 5; }
      .tag { position: absolute; bottom: 44px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #2a201a; }
    `,
    html: `
      <div class="grain"></div><div class="bord"></div>
      <div class="star" style="left:240px"></div><div class="star" style="right:240px"></div>
      <div class="top">MAIN EVENT TONIGHT</div>
      <div class="lock"><h1>QUIP CLASH</h1></div>
      <div class="bub bl">HA!</div><div class="bub br">OH?</div>
      <div class="vs">VS</div>
      <div class="tag">WRITE. VOTE. TALK TRASH</div>`,
  },
  {
    // A ransom-note collage on kraft paper: every letter cut from a different page.
    id: 'mad-libs',
    fonts: ['Anton', 'Playfair Display:wght@800', 'Special Elite', 'Lilita One', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 30%, #b9946a, #a37e52 60%, #87653e); }
      .grain { position: absolute; inset: 0; background-image: radial-gradient(rgba(60,40,15,.1) 1.2px, transparent 1.6px); background-size: 7px 7px; }
      .lock { position: absolute; top: 56px; left: 0; right: 0; display: flex; justify-content: center; gap: 12px; }
      .cut { padding: 8px 18px; font-size: 74px; line-height: 1; box-shadow: 4px 6px 12px rgba(40,20,5,.4); }
      .gap { width: 26px; }
      .strip { position: absolute; left: 50%; top: 280px; transform: translateX(-50%) rotate(-1.4deg); background: #f4ecd8;
        padding: 30px 44px; font-family: 'Special Elite', monospace; font-size: 52px; color: #2c2317; box-shadow: 0 18px 36px rgba(40,20,5,.45);
        clip-path: polygon(0 6%, 3% 0, 97% 2%, 100% 10%, 99% 92%, 95% 100%, 4% 98%, 1% 90%); }
      .strip b { display: inline-block; width: 170px; border-bottom: 5px solid #b3322b; margin: 0 6px; }
      .strip2 { position: absolute; left: 50%; top: 426px; transform: translateX(-50%) rotate(1.2deg); background: #efe3c8;
        padding: 22px 38px; font-family: 'Special Elite', monospace; font-size: 38px; color: #4a3c28; box-shadow: 0 16px 30px rgba(40,20,5,.4);
        clip-path: polygon(1% 8%, 4% 0, 96% 1%, 100% 12%, 98% 90%, 94% 100%, 3% 97%, 0 88%); }
      .tag { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #f4ecd8; }
    `,
    html: `
      <div class="grain"></div>
      <div class="lock">
        <span class="cut" style="font-family:'Anton';background:#f4ecd8;color:#1d1a16;transform:rotate(-4deg)">M</span>
        <span class="cut" style="font-family:'Playfair Display';background:#b3322b;color:#f4ecd8;transform:rotate(3deg)">A</span>
        <span class="cut" style="font-family:'Lilita One';background:#27506b;color:#f4ecd8;transform:rotate(-2deg)">D</span>
        <span class="gap"></span>
        <span class="cut" style="font-family:'Special Elite';background:#e9b63c;color:#1d1a16;transform:rotate(4deg)">L</span>
        <span class="cut" style="font-family:'Anton';background:#1d6b66;color:#f4ecd8;transform:rotate(-3deg)">I</span>
        <span class="cut" style="font-family:'Playfair Display';background:#f4ecd8;color:#b3322b;transform:rotate(2deg)">B</span>
        <span class="cut" style="font-family:'Lilita One';background:#5a3c78;color:#f4ecd8;transform:rotate(-4deg)">S</span>
      </div>
      <div class="strip">The <b></b> ate my <b></b>.</div>
      <div class="strip2">(no peeking at the story)</div>
      <div class="tag">FILL IN THE BLANKS. BLIND</div>`,
  },
  {
    // A modernist film-poster split: a jagged crack divides two flat crowds.
    id: 'split-room',
    fonts: ['Anton', 'Oswald:wght@600'],
    css: `
      body { background: #efe7d6; font-family: 'Anton', sans-serif; }
      .side { position: absolute; top: 0; bottom: 0; width: 50%; }
      .sl { left: 0; background: #e2622b; } .sr { right: 0; background: #1f6b66; }
      .crack { position: absolute; top: 0; bottom: 0; left: 50%; width: 130px; transform: translateX(-50%); background: #efe7d6;
        clip-path: polygon(48% 0, 62% 0, 38% 22%, 66% 38%, 42% 55%, 70% 70%, 46% 86%, 58% 100%, 44% 100%, 24% 86%, 50% 70%, 22% 55%, 46% 38%, 18% 22%); }
      .lock { position: absolute; top: 64px; left: 0; right: 0; text-align: center; color: #efe7d6; z-index: 4; }
      .lock h1 { font-size: 98px; letter-spacing: .02em; text-shadow: 5px 5px 0 rgba(20,15,10,.35); }
      .heads { position: absolute; bottom: 130px; display: flex; gap: 26px; }
      .hl { left: 130px; } .hr { right: 130px; }
      .head { width: 74px; height: 74px; border-radius: 50%; background: #1d1a16; position: relative; }
      .head::after { content: ''; position: absolute; left: 50%; top: 66px; transform: translateX(-50%); width: 96px; height: 60px;
        border-radius: 40px 40px 0 0; background: #1d1a16; }
      .pct { position: absolute; top: 300px; font-size: 120px; color: #efe7d6; z-index: 4; text-shadow: 5px 5px 0 rgba(20,15,10,.3); }
      .p1 { left: 215px; } .p2 { right: 215px; }
      .tag { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #1d1a16; z-index: 4; }
    `,
    html: `
      <div class="side sl"></div><div class="side sr"></div><div class="crack"></div>
      <div class="lock"><h1>SPLIT THE ROOM</h1></div>
      <div class="pct p1">50</div><div class="pct p2">50</div>
      <div class="heads hl"><div class="head"></div><div class="head"></div><div class="head"></div></div>
      <div class="heads hr"><div class="head"></div><div class="head"></div><div class="head"></div></div>
      <div class="tag">THE PERFECT DILEMMA DIVIDES</div>`,
  },
  {
    // A tabloid front page: newsprint, a screaming headline, the truth under glass.
    id: 'fib-finder',
    fonts: ['Abril Fatface', 'Playfair Display:wght@700', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #ece5d4, #ddd2b8); font-family: 'Abril Fatface', serif; }
      .news { position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, rgba(60,50,30,.05) 0 2px, transparent 2px 5px); opacity: .5; }
      .mast { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); text-align: center; font-family: 'Playfair Display', serif;
        font-weight: 700; font-size: 30px; letter-spacing: .3em; color: #4a4234; border-bottom: 3px double #4a4234; width: 560px; padding-bottom: 10px; }
      .lock { position: absolute; top: 96px; left: 0; right: 0; text-align: center; color: #16130d; }
      .lock h1 { font-size: 104px; }
      .cols { position: absolute; left: 150px; right: 150px; top: 262px; height: 230px; display: flex; gap: 26px; }
      .col { flex: 1; background: repeating-linear-gradient(0deg, rgba(40,34,20,.32) 0 4px, transparent 4px 12px); border-radius: 2px; }
      .glass { position: absolute; right: 300px; top: 280px; width: 230px; height: 230px; z-index: 5; }
      .lens { position: absolute; inset: 0; border-radius: 50%; border: 18px solid #8a6a32; background: rgba(252,250,240,.94);
        box-shadow: 0 18px 40px rgba(30,20,5,.4), inset -14px -14px 30px rgba(120,90,40,.18); }
      .lens::before { content: ''; position: absolute; left: 24px; top: 20px; width: 66px; height: 36px; border-radius: 50%;
        background: rgba(255,255,255,.8); transform: rotate(-24deg); }
      .true { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-8deg); font-family: 'Oswald', sans-serif;
        font-weight: 600; font-size: 52px; letter-spacing: .1em; color: #1f6b3a; border: 5px solid #1f6b3a; border-radius: 8px;
        padding: 2px 18px; z-index: 6; }
      .handle { position: absolute; right: -58px; bottom: -48px; width: 130px; height: 34px; border-radius: 18px;
        background: linear-gradient(90deg, #5d4322, #8a6a32); transform: rotate(42deg); box-shadow: 0 10px 20px rgba(30,20,5,.4); }
      .tag { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #4a4234; }
    `,
    html: `
      <div class="news"></div>
      <div class="mast">THE DAILY FIB</div>
      <div class="lock"><h1>Fib Finder</h1></div>
      <div class="cols"><div class="col"></div><div class="col"></div><div class="col"></div></div>
      <div class="glass"><div class="handle"></div><div class="lens"></div><div class="true">TRUE</div></div>
      <div class="tag">ONE TRUTH HIDES IN THE LIES</div>`,
  },
  {
    // A gallery wall: gilt frame, a proud doodle, a spotlight and a rosette.
    id: 'sketch-spot',
    fonts: ['Cormorant Garamond:wght@700', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #efe6d2 0%, #e4d6ba 70%, #cdbb96 100%); font-family: 'Cormorant Garamond', serif; }
      .spot { position: absolute; left: 50%; top: -60px; transform: translateX(-50%); width: 760px; height: 560px;
        background: radial-gradient(50% 65% at 50% 0%, rgba(255,248,224,.85), transparent 70%); }
      .lock { position: absolute; top: 54px; left: 0; right: 0; text-align: center; color: #3d3322; }
      .lock h1 { font-size: 92px; font-weight: 700; letter-spacing: .04em; }
      .lock .rule { width: 360px; height: 2px; margin: 6px auto 0; background: linear-gradient(90deg, transparent, #8a6a32, transparent); }
      .frame { position: absolute; left: 50%; top: 212px; transform: translateX(-50%) rotate(-.6deg); width: 480px; height: 320px;
        background: linear-gradient(135deg, #d8b25e, #a8801f 55%, #c9a14f); border-radius: 8px; padding: 22px;
        box-shadow: 0 26px 50px rgba(60,40,10,.45), inset 0 0 0 6px #8a6a32; }
      .canvas { width: 100%; height: 100%; background: #faf6ea; box-shadow: inset 0 0 24px rgba(90,70,30,.15); }
      .rosette { position: absolute; right: -34px; top: -30px; width: 96px; height: 96px; border-radius: 50%; z-index: 6;
        background: radial-gradient(circle at 40% 32%, #d8625a, #a02a26); box-shadow: 0 10px 20px rgba(60,20,10,.4); display: grid; place-items: center; }
      .rosette::after { content: ''; position: absolute; bottom: -42px; left: 50%; transform: translateX(-50%); width: 54px; height: 56px;
        background: #a02a26; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%); }
      .rosette b { width: 40px; height: 40px; border-radius: 50%; background: #f3d9a4; }
      .plaque { position: absolute; left: 50%; bottom: 88px; transform: translateX(-50%); background: #8a6a32; color: #f7eed3;
        font-size: 30px; padding: 8px 30px; border-radius: 6px; letter-spacing: .12em; box-shadow: 0 8px 18px rgba(60,40,10,.35); white-space: nowrap; }
      .tag { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #6d5a38; }
    `,
    html: `
      <div class="spot"></div>
      <div class="lock"><h1>Sketch &amp; Spot</h1><div class="rule"></div></div>
      <div class="frame">
        <div class="canvas">
          <svg viewBox="0 0 440 280" style="width:100%;height:100%">
            <g fill="none" stroke-linecap="round">
              <circle cx="220" cy="96" r="42" stroke="#3a66b8" stroke-width="8"/>
              <path d="M220 138 L220 208 M220 158 L176 188 M220 158 L264 188 M220 208 L186 250 M220 208 L254 250" stroke="#3a66b8" stroke-width="8"/>
              <path d="M206 90 l3 3 M232 90 l3 3" stroke="#1d1a16" stroke-width="9"/>
              <path d="M204 112 q 16 12 32 0" stroke="#d8625a" stroke-width="7"/>
              <path d="M96 240 q 124 34 248 0" stroke="#57b85f" stroke-width="7" stroke-dasharray="2 14"/>
            </g>
          </svg>
        </div>
        <div class="rosette"><b></b></div>
      </div>
      <div class="plaque">"Untitled No. 7"</div>
      <div class="tag">EVERYONE'S A CRITIC</div>`,
  },
  {
    // A walnut CRT television: the show beams in with a LIVE badge and scanlines.
    id: 'what-you-didnt-know',
    fonts: ['Righteous', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 30%, #355a55, #27433f 60%, #182b28); font-family: 'Righteous', sans-serif; }
      .wall { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.05) 2px, transparent 2.6px); background-size: 44px 44px; }
      .ears { position: absolute; left: 50%; top: 30px; width: 0; height: 130px; }
      .ear { position: absolute; bottom: 0; width: 8px; height: 130px; background: #cfc6b2; border-radius: 4px; transform-origin: bottom; }
      .e1 { transform: rotate(-32deg); } .e2 { transform: rotate(30deg); }
      .ear::after { content: ''; position: absolute; top: -12px; left: -6px; width: 20px; height: 20px; border-radius: 50%; background: #cfc6b2; }
      .tv { position: absolute; left: 50%; top: 140px; transform: translateX(-50%); width: 780px; height: 460px; border-radius: 44px;
        background: linear-gradient(180deg, #6d4a2a, #4a3018); box-shadow: 0 30px 60px rgba(0,0,0,.55), inset 0 3px 0 rgba(255,220,160,.25); padding: 30px; display: flex; gap: 26px; }
      .screen { flex: 1; border-radius: 90px / 60px; background: radial-gradient(120% 120% at 50% 40%, #16324e, #0c1d30 75%); position: relative; overflow: hidden;
        box-shadow: inset 0 0 60px rgba(0,0,0,.7), inset 0 0 0 6px #2c1c0c; }
      .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 2px, transparent 2px 6px); }
      .glare { position: absolute; left: 8%; top: 6%; width: 36%; height: 30%; border-radius: 50%; background: rgba(255,255,255,.12); transform: rotate(-18deg); }
      .ttl { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; color: #ffd887; padding: 0 40px;
        font-size: 54px; line-height: 1.14; text-shadow: 0 0 24px rgba(255,216,135,.45), 0 3px 0 rgba(0,0,0,.5); }
      .live { position: absolute; right: 26px; top: 22px; background: #c0392f; color: #fff; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 20px; letter-spacing: .2em; padding: 4px 14px; border-radius: 6px; box-shadow: 0 0 18px rgba(192,57,47,.7); }
      .panel { width: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
      .knob { width: 56px; height: 56px; border-radius: 50%; background: radial-gradient(circle at 36% 30%, #d8c39a, #8a6a3c);
        box-shadow: 0 6px 12px rgba(0,0,0,.5); position: relative; }
      .knob::after { content: ''; position: absolute; left: 50%; top: 6px; width: 5px; height: 18px; background: #3a2a16; transform: translateX(-50%); border-radius: 3px; }
      .grill { width: 64px; height: 90px; background: repeating-linear-gradient(0deg, #3a2a16 0 6px, #6d4a2a 6px 14px); border-radius: 8px; }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #cfc6b2; }
    `,
    html: `
      <div class="wall"></div>
      <div class="ears"><div class="ear e1"></div><div class="ear e2"></div></div>
      <div class="tv">
        <div class="screen">
          <div class="ttl">What, You<br>Didn't Know That?</div>
          <div class="scan"></div><div class="glare"></div>
          <div class="live">LIVE</div>
        </div>
        <div class="panel"><div class="knob"></div><div class="knob"></div><div class="grill"></div></div>
      </div>
      <div class="tag">BUZZ IN FIRST</div>`,
  },
  {
    // A stenciled shipping crate: the acronym, then what it REALLY stands for.
    id: 'backronym',
    fonts: ['Stardos Stencil:wght@700', 'Caveat:wght@700', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #c2a26e, #ab8a55 60%, #8f7041); font-family: 'Stardos Stencil', serif; }
      .planks { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 118px, rgba(70,45,15,.35) 118px 124px),
        repeating-linear-gradient(90deg, rgba(255,235,200,.05) 0 3px, transparent 3px 90px); }
      .lock { position: absolute; top: 52px; left: 0; right: 0; text-align: center; color: #2e2414; }
      .lock h1 { font-size: 92px; font-weight: 700; letter-spacing: .06em; }
      .stamp { position: absolute; right: 130px; top: 60px; transform: rotate(8deg); border: 5px solid #8c2f23; color: #8c2f23;
        font-size: 24px; padding: 6px 18px; border-radius: 8px; opacity: .8; letter-spacing: .2em; font-family: 'Oswald', sans-serif; }
      .row { position: absolute; left: 50%; top: 244px; transform: translateX(-50%); display: flex; gap: 64px; }
      .unit { display: flex; flex-direction: column; align-items: center; gap: 16px; }
      .big { font-size: 150px; line-height: 1; color: #1d1a16; text-shadow: 0 4px 0 rgba(255,235,200,.25); }
      .tape { background: #efe3c8; padding: 8px 22px; transform: rotate(-3deg); box-shadow: 0 8px 16px rgba(60,35,10,.35);
        font-family: 'Caveat', cursive; font-weight: 700; font-size: 42px; color: #3d2c10; }
      .u2 .tape { transform: rotate(2deg); } .u3 .tape { transform: rotate(-2deg); }
      .tag { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #2e2414; }
    `,
    html: `
      <div class="planks"></div>
      <div class="lock"><h1>BACKRONYM</h1></div>
      <div class="stamp">TOP SECRET-ISH</div>
      <div class="row">
        <div class="unit"><div class="big">S</div><div class="tape">Suspicious</div></div>
        <div class="unit u2"><div class="big">O</div><div class="tape">Office</div></div>
        <div class="unit u3"><div class="big">S</div><div class="tape">Snacks</div></div>
      </div>
      <div class="tag">WHAT IT REALLY STANDS FOR</div>`,
  },
  {
    // A honeycomb: the swarm converges on one glowing answer cell.
    id: 'hivemind',
    fonts: ['Chewy', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 30%, #4a3408, #33240a 60%, #201604); font-family: 'Chewy', cursive; }
      .lock { position: absolute; top: 54px; left: 0; right: 0; text-align: center; color: #ffd887; z-index: 4; }
      .lock h1 { font-size: 100px; text-shadow: 0 4px 0 rgba(40,22,4,.7), 0 0 36px rgba(255,216,135,.3); }
      .hex { position: absolute; width: 150px; height: 130px; clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
        background: linear-gradient(180deg, #8a611c, #6d4a12); box-shadow: inset 0 0 30px rgba(0,0,0,.4); }
      .hex.glow { background: linear-gradient(180deg, #ffd24d, #e8a325); }
      .halo { position: absolute; left: 545px; top: 330px; width: 150px; height: 130px; border-radius: 40px; box-shadow: 0 0 90px 30px rgba(255,210,77,.35); }
      .bee { position: absolute; width: 86px; height: 56px; }
      .bee .body { position: absolute; inset: 8px 0; border-radius: 28px; background: repeating-linear-gradient(90deg, #ffd24d 0 14px, #1d1a16 14px 26px);
        box-shadow: 0 6px 12px rgba(0,0,0,.45); }
      .bee .wing { position: absolute; top: -10px; width: 34px; height: 26px; border-radius: 50%; background: rgba(255,255,255,.55); }
      .bee .w1 { left: 16px; transform: rotate(-24deg); } .bee .w2 { left: 40px; transform: rotate(18deg); }
      .trail { position: absolute; height: 5px; border-radius: 3px;
        background: repeating-linear-gradient(90deg, rgba(255,216,135,.65) 0 14px, transparent 14px 26px); }
      .tag { position: absolute; bottom: 38px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #d8a040; }
    `,
    html: `
      <div class="hex" style="left:420px; top:262px"></div>
      <div class="hex" style="left:545px; top:194px"></div>
      <div class="halo"></div>
      <div class="hex glow" style="left:545px; top:330px"></div>
      <div class="hex" style="left:670px; top:262px"></div>
      <div class="hex" style="left:670px; top:398px"></div>
      <div class="hex" style="left:420px; top:398px"></div>
      <div class="lock"><h1>Hivemind</h1></div>
      <div class="trail" style="left:210px; top:392px; width:150px; transform:rotate(8deg)"></div>
      <div class="bee" style="left:150px; top:352px; transform:rotate(10deg)"><div class="wing w1"></div><div class="wing w2"></div><div class="body"></div></div>
      <div class="trail" style="right:226px; top:380px; width:140px; transform:rotate(-10deg)"></div>
      <div class="bee" style="right:150px; top:340px; transform:scaleX(-1) rotate(10deg)"><div class="wing w1"></div><div class="wing w2"></div><div class="body"></div></div>
      <div class="tag">THINK LIKE THE SWARM</div>`,
  },
  {
    // A yearbook superlatives spread: laurel, oval portraits, the winning vote.
    id: 'most-likely',
    fonts: ['Playfair Display:ital,wght@0,800;1,700', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #f2ead6, #e7dabb); font-family: 'Playfair Display', serif; }
      .edge { position: absolute; inset: 26px; border: 3px solid #8a6a32; border-radius: 6px; }
      .edge::after { content: ''; position: absolute; inset: 8px; border: 1px solid #8a6a32; border-radius: 4px; opacity: .6; }
      .kick { position: absolute; top: 58px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .5em; color: #8a6a32; }
      .lock { position: absolute; top: 86px; left: 0; right: 0; text-align: center; color: #3d3322; }
      .lock h1 { font-size: 88px; font-weight: 800; }
      .ovals { position: absolute; left: 50%; top: 250px; transform: translateX(-50%); display: flex; gap: 56px; align-items: flex-start; }
      .oval { width: 180px; height: 230px; border-radius: 50%; background: linear-gradient(180deg, #d8ccac, #c4b58e);
        border: 8px solid #8a6a32; box-shadow: 0 16px 32px rgba(80,60,20,.3), inset 0 0 30px rgba(80,60,20,.25); position: relative; overflow: hidden; margin-top: 30px; }
      .oval .h { position: absolute; left: 50%; top: 48px; transform: translateX(-50%); width: 74px; height: 74px; border-radius: 50%; background: #5a4a2e; }
      .oval .s { position: absolute; left: 50%; top: 128px; transform: translateX(-50%); width: 126px; height: 90px; border-radius: 60px 60px 0 0; background: #5a4a2e; }
      .oval.win { width: 220px; height: 280px; border-color: #c9a14f; margin-top: 0;
        box-shadow: 0 20px 40px rgba(80,60,20,.35), 0 0 50px rgba(201,161,79,.4), inset 0 0 30px rgba(80,60,20,.25); }
      .oval.win .h { width: 92px; height: 92px; top: 58px; } .oval.win .s { width: 156px; height: 110px; top: 158px; }
      .crownlet { position: absolute; left: 50%; top: -14px; transform: translateX(-50%) rotate(-4deg); width: 78px; height: 48px; z-index: 6;
        background: #e7c277; clip-path: polygon(0 100%, 0 28%, 22% 58%, 50% 8%, 78% 58%, 100% 28%, 100% 100%); filter: drop-shadow(0 6px 10px rgba(80,60,20,.4)); }
      .winwrap { position: relative; }
      .banner { position: absolute; left: 50%; bottom: 90px; transform: translateX(-50%) rotate(-1.6deg); background: #8c2f23; color: #f3e2b8;
        font-style: italic; font-weight: 700; font-size: 38px; padding: 12px 44px; box-shadow: 0 12px 26px rgba(80,30,10,.35); white-space: nowrap;
        clip-path: polygon(3% 0, 97% 0, 100% 50%, 97% 100%, 3% 100%, 0 50%); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #8a6a32; }
    `,
    html: `
      <div class="edge"></div>
      <div class="kick">CLASS SUPERLATIVES</div>
      <div class="lock"><h1>Most Likely To...</h1></div>
      <div class="ovals">
        <div class="oval"><div class="h"></div><div class="s"></div></div>
        <div class="winwrap"><div class="crownlet"></div><div class="oval win"><div class="h"></div><div class="s"></div></div></div>
        <div class="oval"><div class="h"></div><div class="s"></div></div>
      </div>
      <div class="banner">...survive on charm alone</div>
      <div class="tag">THE ROOM DECIDES</div>`,
  },
  {
    // A night game at the park: pennants, the outfield wall, one big question.
    id: 'ballpark',
    fonts: ['Holtwood One SC', 'Oswald:wght@600'],
    css: `
      body { background: linear-gradient(180deg, #101b30 0%, #16243c 52%, #1f6b3a 78%, #1a5a31 100%); font-family: 'Holtwood One SC', serif; }
      .stars { position: absolute; inset: 0 0 50% 0; background-image: radial-gradient(rgba(255,255,255,.5) 1px, transparent 1.5px); background-size: 90px 70px; opacity: .5; }
      .penn { position: absolute; top: 0; left: 0; right: 0; height: 64px; display: flex; }
      .pf { flex: 1; clip-path: polygon(0 0, 100% 0, 50% 100%); }
      .lock { position: absolute; top: 104px; left: 0; right: 0; text-align: center; color: #efe3c8; }
      .lock h1 { font-size: 88px; text-shadow: 0 5px 0 #0a1322, 0 12px 24px rgba(0,0,0,.5); }
      .wall { position: absolute; left: 0; right: 0; bottom: 96px; height: 150px; background: #14401f; border-top: 10px solid #ffce5a; }
      .dist { position: absolute; left: 50%; bottom: 128px; transform: translateX(-50%); color: #ffce5a; font-size: 72px; text-shadow: 0 4px 0 #0a2412; }
      .ball { position: absolute; right: 210px; top: 250px; width: 130px; height: 130px; border-radius: 50%;
        background: radial-gradient(circle at 36% 30%, #ffffff, #d8d2c4 75%); box-shadow: 0 16px 32px rgba(0,0,0,.5); }
      .ball svg { position: absolute; inset: 0; }
      .swoosh { position: absolute; right: 330px; top: 290px; width: 220px; height: 8px; border-radius: 4px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.55)); transform: rotate(-12deg); }
      .tag { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #bdd8c2; }
    `,
    html: `
      <div class="stars"></div>
      <div class="penn">
        <div class="pf" style="background:#d8625a"></div><div class="pf" style="background:#efe3c8"></div>
        <div class="pf" style="background:#3a66b8"></div><div class="pf" style="background:#efe3c8"></div>
        <div class="pf" style="background:#d8625a"></div><div class="pf" style="background:#efe3c8"></div>
        <div class="pf" style="background:#3a66b8"></div><div class="pf" style="background:#efe3c8"></div>
        <div class="pf" style="background:#d8625a"></div><div class="pf" style="background:#efe3c8"></div>
        <div class="pf" style="background:#3a66b8"></div><div class="pf" style="background:#efe3c8"></div>
      </div>
      <div class="lock"><h1>BALLPARK</h1></div>
      <div class="swoosh"></div>
      <div class="ball">
        <svg viewBox="0 0 130 130">
          <path d="M 30 8 Q 6 65 30 122" fill="none" stroke="#c0463f" stroke-width="5" stroke-dasharray="7 7"/>
          <path d="M 100 8 Q 124 65 100 122" fill="none" stroke="#c0463f" stroke-width="5" stroke-dasharray="7 7"/>
        </svg>
      </div>
      <div class="wall"></div>
      <div class="dist">404 FT?</div>
      <div class="tag">CLOSEST GUESS WINS</div>`,
  },
  {
    // A masquerade: three plain masks and the one that doesn't belong.
    id: 'faker',
    fonts: ['Marcellus', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 25%, #3d2a52, #2a1c3a 60%, #190f24); font-family: 'Marcellus', serif; }
      .damask { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.045) 2px, transparent 2.6px); background-size: 38px 38px; }
      .lock { position: absolute; top: 56px; left: 0; right: 0; text-align: center; }
      .lock h1 { font-size: 96px; background: linear-gradient(180deg, #f0d9a0, #c9a14f 60%, #8c6c2a);
        -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: .12em; }
      .lock .sub { color: #9d87bd; font-family: 'Oswald', sans-serif; font-size: 20px; letter-spacing: .5em; margin-top: 4px; }
      .masks { position: absolute; left: 50%; top: 300px; transform: translateX(-50%); display: flex; gap: 54px; align-items: center; }
      .mask { width: 170px; height: 110px; position: relative; border-radius: 80px 80px 70px 70px / 90px 90px 50px 50px;
        background: linear-gradient(180deg, #f4efe2, #d8cfb8); box-shadow: 0 14px 28px rgba(0,0,0,.45), inset 0 -8px 16px rgba(120,100,60,.25); }
      .mask::before, .mask::after { content: ''; position: absolute; top: 38px; width: 38px; height: 26px; border-radius: 50%; background: #190f24; }
      .mask::before { left: 32px; transform: rotate(-8deg); } .mask::after { right: 32px; transform: rotate(8deg); }
      .mask.odd { width: 210px; height: 140px; transform: rotate(-5deg) translateY(-18px);
        background: linear-gradient(135deg, #2a2030, #161020); box-shadow: 0 18px 36px rgba(0,0,0,.55), 0 0 50px rgba(201,161,79,.35); }
      .mask.odd::before, .mask.odd::after { background: #c9a14f; box-shadow: 0 0 16px rgba(201,161,79,.8); top: 48px; }
      .crest { position: absolute; left: 50%; top: -16px; transform: translateX(-50%); width: 130px; height: 30px;
        background: #c9a14f; clip-path: polygon(0 100%, 8% 20%, 25% 80%, 50% 0, 75% 80%, 92% 20%, 100% 100%); }
      .stick { position: absolute; right: -28px; bottom: -64px; width: 12px; height: 90px; background: linear-gradient(180deg, #c9a14f, #8c6c2a); transform: rotate(18deg); border-radius: 6px; }
      .tag { position: absolute; bottom: 38px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #c9a86a; }
    `,
    html: `
      <div class="damask"></div>
      <div class="lock"><h1>FAKER</h1><div class="sub">A MASQUERADE OF CLUES</div></div>
      <div class="masks">
        <div class="mask"></div>
        <div class="mask odd"><div class="crest"></div><div class="stick"></div></div>
        <div class="mask"></div>
        <div class="mask"></div>
      </div>
      <div class="tag">ONE OF YOU IS LYING</div>`,
  },
  {
    // Polaroids on a string of fairy lights: one secret stays face-down.
    id: 'truth-or-share',
    fonts: ['Pacifico', 'Caveat:wght@700', 'Oswald:wght@600'],
    css: `
      body { background: radial-gradient(120% 110% at 50% 25%, #46285a, #321b42 60%, #1f1029); font-family: 'Pacifico', cursive; }
      .lock { position: absolute; top: 44px; left: 0; right: 0; text-align: center; color: #ffd9ec; }
      .lock h1 { font-size: 84px; text-shadow: 0 4px 0 rgba(40,12,40,.6), 0 0 36px rgba(255,150,200,.3); }
      .string { position: absolute; left: -20px; right: -20px; top: 240px; height: 120px; }
      .string svg { width: 100%; height: 100%; }
      .bulb { position: absolute; width: 16px; height: 16px; border-radius: 50%; }
      .pol { position: absolute; top: 322px; width: 200px; height: 240px; background: #f7f3e8; padding: 13px 13px 0;
        box-shadow: 0 18px 36px rgba(0,0,0,.5); }
      .pol .ph { width: 100%; height: 160px; position: relative; overflow: hidden; }
      .pol .cap { text-align: center; font-family: 'Caveat', cursive; font-weight: 700; font-size: 32px; color: #4a3454; padding-top: 8px; }
      .clip { position: absolute; left: 50%; top: -26px; transform: translateX(-50%); width: 26px; height: 36px; background: #c9a14f; border-radius: 5px; box-shadow: 0 4px 8px rgba(0,0,0,.4); }
      .p1 { left: 180px; transform: rotate(-5deg); }
      .p1 .ph { background: linear-gradient(180deg, #e88aa8, #b85f86); }
      .p2 { left: 50%; transform: translateX(-50%) rotate(2deg); top: 334px; }
      .p2 .ph { background: linear-gradient(180deg, #7fb8d8, #4a7ea3); }
      .p3 { right: 180px; transform: rotate(6deg); background: #efe8d8; }
      .p3 .back { position: absolute; inset: 13px 13px 64px; background: repeating-linear-gradient(45deg, #ddd2ba 0 14px, #efe8d8 14px 28px); }
      .heart { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-8deg); width: 60px; height: 54px; }
      .heart::before, .heart::after { content: ''; position: absolute; width: 30px; height: 48px; border-radius: 16px 16px 0 0; background: #fff; opacity: .9; }
      .heart::before { left: 8px; transform: rotate(-45deg); } .heart::after { right: 8px; transform: rotate(45deg); }
      .sun { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); width: 60px; height: 60px; border-radius: 50%;
        background: #ffe9b0; box-shadow: 0 0 30px rgba(255,233,176,.8); }
      .tag { position: absolute; bottom: 36px; left: 0; right: 0; text-align: center; font-family: 'Oswald', sans-serif; font-weight: 600;
        font-size: 22px; letter-spacing: .42em; color: #d9a8d0; }
    `,
    html: `
      <div class="lock"><h1>Truth or Share</h1></div>
      <div class="string">
        <svg viewBox="0 0 1320 120" preserveAspectRatio="none">
          <path d="M 0 30 Q 660 130 1320 30" fill="none" stroke="#8a6aa0" stroke-width="4"/>
        </svg>
      </div>
      <div class="bulb" style="left:10%; top:262px; background:#ffd24d; box-shadow:0 0 16px #ffd24d"></div>
      <div class="bulb" style="left:24%; top:284px; background:#7fe3d2; box-shadow:0 0 16px #7fe3d2"></div>
      <div class="bulb" style="left:38%; top:300px; background:#e88aa8; box-shadow:0 0 16px #e88aa8"></div>
      <div class="bulb" style="left:50%; top:306px; background:#ffd24d; box-shadow:0 0 16px #ffd24d"></div>
      <div class="bulb" style="left:62%; top:300px; background:#7fe3d2; box-shadow:0 0 16px #7fe3d2"></div>
      <div class="bulb" style="left:76%; top:284px; background:#e88aa8; box-shadow:0 0 16px #e88aa8"></div>
      <div class="bulb" style="left:90%; top:262px; background:#ffd24d; box-shadow:0 0 16px #ffd24d"></div>
      <div class="pol p1"><div class="clip"></div><div class="ph"><div class="heart"></div></div><div class="cap">last summer!!</div></div>
      <div class="pol p2"><div class="clip"></div><div class="ph"><div class="sun"></div></div><div class="cap">no regrets</div></div>
      <div class="pol p3"><div class="clip"></div><div class="back"></div><div class="cap">not yet...</div></div>
      <div class="tag">SPILL IT OR SHOW IT</div>`,
  },
  {
    // A small upright arcade cabinet, lightly angled, with the Doot logo glowing
    // on its screen: a pink marquee, a coral-eyed wordmark, a joystick + buttons.
    id: 'retro-arcade',
    fonts: ['Bungee', 'Baloo 2:wght@800'],
    css: `
      body { background: radial-gradient(120% 100% at 50% 14%, #3a2150, #1d1233 56%, #0d0818); font-family: 'Bungee', sans-serif; }
      .glow { position: absolute; left: 50%; top: 150px; transform: translateX(-50%); width: 560px; height: 560px; border-radius: 50%; background: #ff3ea0; filter: blur(95px); opacity: .38; }
      .glow2 { position: absolute; left: 50%; top: 230px; transform: translateX(-50%); width: 420px; height: 420px; border-radius: 50%; background: #2fe0d6; filter: blur(95px); opacity: .28; }
      .floor { position: absolute; left: 0; right: 0; bottom: 0; height: 130px; background: linear-gradient(180deg, #2a1d3e, #160f26); }
      .floor::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 76px, rgba(255,142,194,.09) 76px 80px); }
      /* a sliver of the cabinet's right side for depth */
      .side { position: absolute; left: 50%; top: 120px; transform: translateX(118px) skewY(15deg); width: 50px; height: 470px; background: linear-gradient(180deg, #14697f, #0e4252); border: 5px solid #0a212b; border-radius: 0 14px 14px 0; }
      .cab { position: absolute; left: 50%; top: 96px; transform: translateX(-54%); width: 366px; height: 516px; background: linear-gradient(180deg, #25a6c8, #1a7c98); border: 5px solid #0a212b; border-radius: 30px 30px 12px 12px; box-shadow: 0 34px 64px rgba(0,0,0,.55); }
      .marquee { position: absolute; top: 18px; left: 20px; right: 20px; height: 72px; border-radius: 14px; background: linear-gradient(180deg, #ff9fcb, #ff3ea0); border: 4px solid #0a212b; display: grid; place-items: center; box-shadow: 0 0 28px #ff3ea0aa, inset 0 -6px 0 rgba(0,0,0,.16); }
      .marquee span { font-size: 29px; color: #3a0f2a; letter-spacing: .03em; }
      .screen { position: absolute; top: 108px; left: 30px; right: 30px; height: 188px; background: #07131b; border: 5px solid #0a212b; border-radius: 12px; box-shadow: inset 0 0 44px #2fe0d633, 0 0 22px #2fe0d622; display: grid; place-items: center; overflow: hidden; }
      .screen::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.26) 0 3px, transparent 3px 6px); }
      .mark { width: 142px; height: 142px; border-radius: 32px; background: #ff5a33; border: 5px solid #0a212b; transform: rotate(-6deg); display: grid; place-items: center; box-shadow: 0 0 34px #ff5a3399, 0 10px 0 rgba(0,0,0,.18); }
      .mark svg { width: 64%; height: 64%; }
      .panel { position: absolute; top: 322px; left: 26px; right: 26px; height: 82px; background: linear-gradient(180deg, #ffd863, #ffb52e); border: 4px solid #0a212b; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 30px; box-shadow: inset 0 -6px 0 rgba(0,0,0,.14); }
      .stick { width: 34px; height: 56px; position: relative; }
      .stick::before { content: ''; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); width: 14px; height: 42px; background: #0a212b; border-radius: 7px; }
      .stick::after { content: ''; position: absolute; left: 50%; top: 0; transform: translateX(-50%); width: 32px; height: 32px; border-radius: 50%; background: #ff3ea0; border: 3px solid #0a212b; }
      .btns { display: flex; gap: 13px; }
      .btns i { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #0a212b; box-shadow: inset 0 -4px 0 rgba(0,0,0,.22); }
      .btns .r { background: #ff5a33; } .btns .g { background: #62cf3f; } .btns .b { background: #5b79ff; }
      .coin { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); width: 122px; height: 46px; background: #0a212b; border-radius: 8px; display: grid; place-items: center; }
      .coin::after { content: ''; width: 36px; height: 6px; background: #ffd24d; border-radius: 3px; }
      .tag { position: absolute; bottom: 30px; left: 0; right: 0; text-align: center; font-family: 'Bungee', sans-serif; font-size: 19px; letter-spacing: .1em; color: #ffd24d; text-shadow: 0 0 14px #ffd24d99; }
    `,
    html: `
      <div class="glow"></div><div class="glow2"></div><div class="floor"></div>
      <div class="side"></div>
      <div class="cab">
        <div class="marquee"><span>RETRO ARCADE</span></div>
        <div class="screen"><div class="mark"><svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="10" r="3.1" fill="#fff"/><circle cx="16" cy="10" r="3.1" fill="#fff"/><circle cx="8" cy="10" r="1.2" fill="#241910"/><circle cx="16" cy="10" r="1.2" fill="#241910"/><path d="M7 16c1.6 1.6 8.4 1.6 10 0" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg></div></div>
        <div class="panel"><div class="stick"></div><div class="btns"><i class="r"></i><i class="g"></i><i class="b"></i></div></div>
        <div class="coin"></div>
      </div>
      <div class="tag">ANY ROM &middot; INSERT PHONE</div>`,
  },
  {
    // A neon night Grand Prix: a clean hero kart grounded on a perspective road
    // (glowing lane + edge lines, a checker band up ahead), under a dusk sky.
    id: 'pit-party',
    fonts: ['Bungee', 'Chakra Petch:wght@700'],
    css: `
      body { background: linear-gradient(180deg, #21183f 0%, #432a52 40%, #8a4a48 62%, #c06a44 70%, #2a1828 80%); font-family: 'Bungee', sans-serif; }
      .stars i { position: absolute; width: 3px; height: 3px; background: #fff; border-radius: 50%; }
      .horizon { position: absolute; left: 0; right: 0; top: 430px; height: 120px; background: radial-gradient(60% 120% at 50% 0%, #ffb86b 0%, #ff7a4d55 36%, transparent 70%); filter: blur(6px); }
      .road { position: absolute; left: 0; right: 0; bottom: 0; top: 432px; background: linear-gradient(180deg, #36303f 0%, #211c2a 60%, #181520 100%); clip-path: polygon(43% 0, 57% 0, 100% 100%, 0 100%); }
      .edge { position: absolute; bottom: 0; top: 432px; width: 10px; filter: drop-shadow(0 0 10px currentColor); }
      .edge.l { left: 0; background: linear-gradient(180deg, transparent, #4ec3e0); clip-path: polygon(43% 0, calc(43% + 9px) 0, 9px 100%, 0 100%); color: #4ec3e0; width: 100%; }
      .edge.r { right: 0; background: linear-gradient(180deg, transparent, #ff5d8f); clip-path: polygon(calc(57% - 9px) 0, 57% 0, 100% 100%, calc(100% - 9px) 100%); color: #ff5d8f; width: 100%; }
      .lane i { position: absolute; left: 50%; background: #ffd23f; transform: translateX(-50%); border-radius: 2px; box-shadow: 0 0 8px #ffd23faa; }
      .checker { position: absolute; left: 50%; top: 436px; transform: translateX(-50%); width: 168px; height: 22px; background-image: conic-gradient(#f3eee2 90deg, #1a1622 90deg 180deg, #f3eee2 180deg 270deg, #1a1622 270deg); background-size: 17px 11px; clip-path: polygon(11% 0, 89% 0, 100% 100%, 0 100%); opacity: .9; box-shadow: 0 -6px 16px rgba(0,0,0,.4); }
      .speed { position: absolute; height: 7px; border-radius: 4px; background: linear-gradient(90deg, transparent, #fff); opacity: .5; }
      .kart { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); width: 470px; height: 380px; }
      .title { position: absolute; left: 0; right: 0; top: 58px; text-align: center; }
      .title h1 { font-size: 132px; line-height: .86; color: #ffd23f; text-shadow: 9px 9px 0 #0b0a0f; letter-spacing: .01em; }
      .topbar { position: absolute; top: 0; left: 0; right: 0; height: 22px; background: repeating-linear-gradient(-45deg, #ffd23f 0 18px, #0b0a0f 18px 36px); }
      .tag { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 22px; letter-spacing: .3em; color: #f3eee2; text-transform: uppercase; text-shadow: 0 2px 6px #000; }
    `,
    html: `
      <div class="stars">${Array.from({ length: 46 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 50).toFixed(1)}%;opacity:${(0.4 + Math.random() * 0.6).toFixed(2)}"></i>`).join('')}</div>
      <div class="horizon"></div>
      <div class="road"></div>
      <div class="edge l"></div><div class="edge r"></div>
      <div class="lane">${[0, 1, 2, 3, 4].map((k) => { const t = k / 5; const y = 470 + t * 250; const w = 6 + t * 16; const h = 14 + t * 26; return `<i style="top:${y}px;width:${w}px;height:${h}px"></i>` }).join('')}</div>
      <div class="checker"></div>
      <div class="speed" style="left:130px;bottom:300px;width:150px"></div>
      <div class="speed" style="left:90px;bottom:250px;width:210px"></div>
      <div class="speed" style="right:130px;bottom:300px;width:150px;background:linear-gradient(270deg,transparent,#fff)"></div>
      <div class="speed" style="right:90px;bottom:250px;width:210px;background:linear-gradient(270deg,transparent,#fff)"></div>
      <div class="topbar"></div>
      <svg class="kart" viewBox="0 0 440 360">
        <!-- grounding shadow on the tarmac -->
        <ellipse cx="220" cy="322" rx="186" ry="30" fill="#000" opacity="0.42"/>
        <!-- rear axle hint -->
        <rect x="120" y="232" width="200" height="40" rx="14" fill="#15131a"/>
        <!-- wheels: big, round, outlined, with rim + hub -->
        <g>
          <circle cx="86" cy="262" r="60" fill="#1b1822" stroke="#0b0a0f" stroke-width="9"/>
          <circle cx="86" cy="262" r="34" fill="#2c2734"/>
          <circle cx="86" cy="262" r="15" fill="#d8d2c4" stroke="#0b0a0f" stroke-width="5"/>
          <circle cx="354" cy="262" r="60" fill="#1b1822" stroke="#0b0a0f" stroke-width="9"/>
          <circle cx="354" cy="262" r="34" fill="#2c2734"/>
          <circle cx="354" cy="262" r="15" fill="#d8d2c4" stroke="#0b0a0f" stroke-width="5"/>
        </g>
        <!-- chassis body -->
        <path d="M74 246 q-12 -126 146 -126 q158 0 146 126 q9 40 -42 52 H116 q-51 -12 -42 -52 Z" fill="#ff4d5e" stroke="#0b0a0f" stroke-width="10"/>
        <!-- side accent stripe -->
        <path d="M70 214 q150 -26 300 0 l0 18 q-150 -22 -300 0 Z" fill="#ffd23f"/>
        <!-- spoiler -->
        <rect x="166" y="92" width="108" height="20" rx="6" fill="#15131a" stroke="#0b0a0f" stroke-width="7"/>
        <rect x="206" y="104" width="28" height="22" fill="#15131a"/>
        <!-- cockpit -->
        <ellipse cx="220" cy="176" rx="80" ry="50" fill="#15131a" stroke="#0b0a0f" stroke-width="9"/>
        <!-- driver helmet + visor -->
        <circle cx="220" cy="170" r="44" fill="#ffd23f" stroke="#0b0a0f" stroke-width="9"/>
        <path d="M184 168 a36 30 0 0 1 72 0 Z" fill="#14121a"/>
        <rect x="190" y="150" width="60" height="9" rx="4" fill="#9be8ff"/>
        <!-- headlights -->
        <circle cx="138" cy="242" r="14" fill="#fff4cf" stroke="#0b0a0f" stroke-width="6"/>
        <circle cx="302" cy="242" r="14" fill="#fff4cf" stroke="#0b0a0f" stroke-width="6"/>
        <!-- number plate -->
        <rect x="184" y="252" width="72" height="44" rx="7" fill="#f3eee2" stroke="#0b0a0f" stroke-width="7"/>
        <text x="220" y="287" text-anchor="middle" font-family="Bungee" font-size="30" fill="#0b0a0f">1</text>
      </svg>
      <div class="title"><h1>PIT PARTY</h1></div>
      <div class="tag">Grab a wheel &middot; Win the cup</div>`,
  },
]

const only = process.argv.slice(2)
const list = only.length ? COVERS.filter((c) => only.includes(c.id)) : COVERS
if (!list.length) {
  console.error('no matching cover ids')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
for (const c of list) {
  await page.setContent(pageFor(c), { waitUntil: 'networkidle' })
  try {
    await page.evaluate(() => document.fonts.ready)
  } catch {
    /* system fallback is fine */
  }
  await page.waitForTimeout(250)
  const out = resolve(outDir, `${c.id}.jpg`)
  await page.screenshot({ path: out, type: 'jpeg', quality: 84 })
  console.log('wrote', out)
}
await browser.close()
