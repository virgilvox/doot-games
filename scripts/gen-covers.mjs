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
 * mapped in GameCover.vue + useSeo.ts (keep both in sync).
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
