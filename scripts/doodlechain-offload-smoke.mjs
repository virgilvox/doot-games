/**
 * Real-browser smoke for the EPHEMERAL BLOB OFFLOAD (Claim-Check), the fix for the
 * "payload too large" crash on Doodle Chain results. Unlike doodlechain-smoke.mjs
 * (small scribbles, inline path), this drives DENSE drawings so the aggregated
 * results "unspool" exceeds one CLASP frame (65535 bytes) and MUST be offloaded to
 * object storage. It then asserts the offload really happened end to end:
 *   - the HOST POSTs the results to the blobs route at finish (the value offloaded);
 *   - a PHONE fetches the offloaded object (resolve) and renders the full gallery.
 * Without the fix, finish() would throw "Payload too large" and strand the room.
 *
 * REQUIRES object storage (MinIO/Spaces) configured on the dev server, e.g.:
 *   docker compose -f docker/docker-compose.yml up -d minio    # then create the bucket
 *   SPACES_ENDPOINT=http://localhost:9000 SPACES_REGION=us-east-1 SPACES_BUCKET=doot \
 *   SPACES_KEY=minioadmin SPACES_SECRET=minioadmin pnpm dev
 *   node scripts/doodlechain-offload-smoke.mjs
 */
import { chromium } from 'playwright'

process.on('unhandledRejection', (e) => {
  console.error('\nUNHANDLED REJECTION:', e)
  process.exit(2)
})
process.on('uncaughtException', (e) => {
  console.error('\nUNCAUGHT EXCEPTION:', e)
  process.exit(2)
})

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (o > 0) throw new Error(`${label}: ${o}px horizontal overflow`)
}

// Draw a dense drawing with REAL Playwright mouse input. `mouse.move(..., { steps })`
// batches many interpolated pointermove events in one call, so each stroke records
// ~steps points spaced well past DrawCanvas's 0.004 near-duplicate cull. ~22 strokes
// x ~55 points ~= 17 KB per drawing; the six drawings in a Doodle Chain recap then
// comfortably exceed the 65535-byte CLASP frame ceiling, forcing the offload.
async function drawDense(page, seed, strokes = 22, steps = 55) {
  const canvas = page.locator('.draw-canvas canvas')
  await canvas.waitFor({ timeout: 40000 })
  await page.waitForTimeout(300) // let the lazy Pixi Application finish mounting
  const box = await canvas.boundingBox()
  for (let s = 0; s < strokes; s++) {
    const y = box.y + box.height * (0.08 + 0.84 * (s / strokes))
    const dy = box.height * 0.05 * (s % 2 ? 1 : -1)
    await page.mouse.move(box.x + box.width * 0.06, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.94, y + dy, { steps })
    await page.mouse.up()
  }
  // Diagnostic: read back the recorded drawing so density is visible in the log.
  const info = await page.evaluate(() => {
    const inst = document.querySelector('.draw-canvas')?.__vueParentComponent
    const mv = inst?.props?.modelValue
    const st = mv?.strokes || []
    return { strokes: st.length, points: st.reduce((a, s) => a + (s.points ? s.points.length : 0), 0) / 2, bytes: JSON.stringify(mv || {}).length }
  })
  console.log(`    · drew ${info.strokes} strokes / ${info.points} points (${(info.bytes / 1024).toFixed(1)} KB)`)
}

async function preflightStorage() {
  // A tiny POST that the app will store; 501 means storage is not configured.
  const r = await fetch(`${BASE}/api/rooms/ABCD/blobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ping: true }),
  })
  if (r.status === 501) {
    throw new Error(
      'Object storage is not configured on the dev server. Start MinIO and run the dev server with SPACES_* env (see this file header).',
    )
  }
  if (!r.ok) throw new Error(`storage preflight failed (${r.status})`)
}

async function run() {
  await preflightStorage()
  const browser = await chromium.launch()
  try {
    step('Doodle Chain OFFLOAD: dense drawings force a >64KB results value')
    const host = await (await browser.newContext()).newPage()

    // Watch the host for the offload: a POST to the blobs route (app -> storage).
    let hostUploads = 0
    host.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/rooms\/[^/]+\/blobs$/.test(req.url())) hostUploads++
    })

    await host.goto(`${BASE}/host/doodle-chain`)
    await host.waitForSelector('.code', { timeout: 40000 })
    await host.waitForSelector('.round-opt', { timeout: 40000 })
    await host.locator('.round-opt', { hasText: /^2$/ }).first().click() // 2 drawings = 5 rounds, 6 drawings total
    const code = (await host.textContent('.code')).trim()

    const names = ['Ana', 'Bo', 'Cy']
    const players = []
    for (const name of names) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage()
      await p.goto(`${BASE}/play/${code}`)
      await p.waitForSelector('input', { timeout: 40000 })
      await p.locator('input').last().fill(name)
      await p.click('button:has-text("Join")')
      await p.waitForSelector('text=You are in', { timeout: 40000 })
      players.push({ name, page: p })
    }
    ok(`3 players joined room ${code}`)

    // Watch a phone for the resolve fetch: a GET of the blob read route.
    const phone = players[0].page
    let phoneResolves = 0
    phone.on('request', (req) => {
      if (req.method() === 'GET' && /\/api\/rooms\/[^/]+\/blobs\/[0-9a-f-]/.test(req.url())) phoneResolves++
    })

    await host.waitForSelector('button:has-text("Start game")', { timeout: 40000 })
    await host.click('button:has-text("Start game")')

    let rounds = 0
    for (let r = 0; r < 7; r++) {
      await host.waitForSelector('button:has-text("Open voting")', { timeout: 40000 })
      await host.click('button:has-text("Open voting")')

      for (let i = 0; i < players.length; i++) {
        const p = players[i].page
        await p.waitForSelector('.draw-canvas, .line-input', { timeout: 40000 })
        const isDraw = (await p.locator('.draw-canvas').count()) > 0
        if (isDraw) {
          await drawDense(p, i + r * 3)
          await noOverflow(p, `draw round ${r}`)
        } else {
          await p.locator('.line-input').fill(`${players[i].name} says something on round ${r}`)
        }
        await p.click('button:has-text("Lock it in")')
      }

      await host.waitForSelector('button:has-text("Lock voting")', { timeout: 40000 })
      await host.click('button:has-text("Lock voting")')
      await host.waitForSelector('button:has-text("Reveal")', { timeout: 40000 })
      await host.click('button:has-text("Reveal")')
      rounds++
      await host.waitForSelector('button:has-text("Next round"), button:has-text("Final results")', { timeout: 40000 })
      if (await host.locator('button:has-text("Final results")').count()) {
        await host.click('button:has-text("Final results")')
        break
      }
      await host.click('button:has-text("Next round")')
    }
    if (rounds !== 5) throw new Error(`expected 5 rounds (2 drawings), played ${rounds}`)
    ok('played a full chain with dense drawings')

    // The host renders its own (local) full results; the KEY end-to-end proof is that
    // the value was offloaded and a phone resolved it back into a full gallery.
    await host.waitForSelector('.unspool .chain', { timeout: 40000 })
    const hostThumbs = await host.locator('.unspool .draw-thumb').count()
    if (hostThumbs < 1) throw new Error('host unspool has no drawings')

    if (hostUploads < 1) {
      throw new Error(
        `OFFLOAD DID NOT TRIGGER: the results value stayed under the offload threshold (${hostUploads} uploads). Increase drawing density in drawDense() so the recap exceeds 64 KB.`,
      )
    }
    ok(`results offloaded to storage (host: ${hostUploads} upload(s)) instead of throwing "payload too large"`)

    // The phone must resolve the offloaded reference and render the full unspool.
    await phone.waitForSelector('.unspool .chain', { timeout: 40000 })
    const phoneThumbs = await phone.locator('.unspool .draw-thumb').count()
    if (phoneThumbs < 1) throw new Error('phone unspool resolved no drawings (offload resolve failed)')
    await noOverflow(phone, 'results (phone)')
    if (phoneResolves < 1) throw new Error('phone never fetched the offloaded object (resolve path not exercised)')
    ok(`phone resolved the offloaded results (${phoneResolves} fetch(es)) and rendered ${phoneThumbs} drawings, 0 overflow at 390px`)

    console.log('\nDoodle Chain OFFLOAD smoke PASSED')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nDoodle Chain OFFLOAD smoke FAILED:', e.message)
  process.exit(1)
})
