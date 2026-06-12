/**
 * Real-browser smoke of the Retro Arcade spectator stream (CLASP-signaled WebRTC).
 * The host boots, an animated test canvas is injected into the screen (a dummy ROM
 * has no real emulator canvas), the host broadcasts, and a /watch/<code> viewer
 * connects over the relay. Asserts the full signaling + ICE handshake completes
 * (peer connection reaches `connected`), the viewer receives the media track, the
 * host reflects the viewer count, and the fullscreen control is present.
 *
 * NOTE: it does NOT assert decoded video frames. Headless Chromium cannot encode
 * WebRTC video from a canvas captureStream without a GPU/display (framesEncoded
 * stays 0), so frame decode is unverifiable here; the encode path is exercised by
 * the prototype in a real browser. Everything up to and including a connected peer
 * with the track attached IS verified. Two contexts on one machine also need raw
 * host ICE candidates (the launch flag), since Chromium's privacy mDNS `.local`
 * candidates don't resolve across contexts in a test.
 *
 * Run: pnpm dev then node scripts/retro-arcade-stream-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ROM = 'https://example.com/demo.nes'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)
const errors = []
const PC_HOOK = `(() => { const O = window.RTCPeerConnection; if (!O || O.__h) return; window.RTCPeerConnection = class extends O { constructor(...a){ super(...a); window.__pc = this; } }; window.RTCPeerConnection.__h = true; })()`

async function run() {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] })
  try {
    step('Host boots and broadcasts')
    const host = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    host.on('pageerror', (e) => {
      if (!/emulatorjs|EJS|wasm/i.test(e.message)) errors.push(`[host] ${e.message}`)
    })
    await host.goto(`${BASE}/host/retro-arcade`)
    await host.waitForSelector('.big-code', { timeout: 60000 })
    const code = (await host.textContent('.big-code')).trim()
    await host.fill('input[type="text"]', ROM)
    await host.click('button:has-text("Boot & open room")')
    await host.waitForSelector('#arcade-screen', { timeout: 60000 })
    await host.evaluate(() => {
      const mount = document.querySelector('#arcade-screen')
      const c = document.createElement('canvas')
      c.width = 320
      c.height = 240
      mount.appendChild(c)
      const ctx = c.getContext('2d')
      let x = 0
      const draw = () => {
        ctx.fillStyle = '#102030'
        ctx.fillRect(0, 0, 320, 240)
        ctx.fillStyle = '#ff5a33'
        ctx.fillRect(x % 280, 90, 44, 44)
        x += 5
        requestAnimationFrame(draw)
      }
      draw()
    })
    await host.click('button:has-text("Broadcast the screen")')
    ok(`broadcasting room ${code}`)

    step('A viewer opens /watch/<code> and the peer connects')
    const viewer = await (await browser.newContext({ viewport: { width: 720, height: 560 } })).newPage()
    viewer.on('pageerror', (e) => errors.push(`[viewer] ${e.message}`))
    await viewer.addInitScript(PC_HOOK)
    await viewer.goto(`${BASE}/watch/${code}`)
    await viewer.waitForSelector('video.vid', { timeout: 60000 })
    // The peer connection reaches `connected` (offer/answer/ICE over the relay).
    // Allow generous time: STUN may be unreachable in CI, so ICE falls back to
    // host candidates after a gather timeout.
    await viewer.waitForFunction(() => window.__pc && window.__pc.connectionState === 'connected', { timeout: 45000 })
    ok('viewer peer connection reached "connected"')

    const track = await viewer.evaluate(() => {
      const v = document.querySelector('video.vid')
      const t = v?.srcObject?.getVideoTracks?.()[0]
      return { hasSrc: !!v?.srcObject, kind: t?.kind, ready: t?.readyState }
    })
    if (track.hasSrc && track.kind === 'video' && track.ready === 'live') ok('viewer received the live video track')
    else errors.push(`viewer did not receive a live track: ${JSON.stringify(track)}`)

    if (await viewer.locator('button:has-text("Fullscreen")').count()) ok('fullscreen control present on the watch page')
    else errors.push('no fullscreen control on the watch page')

    step('Host reflects the viewer count')
    await host.waitForTimeout(600)
    const watching = await host.textContent('.watching').catch(() => '')
    if (/[1-9]/.test(watching || '')) ok(`host shows viewers watching (${watching.trim()})`)
    else errors.push(`host viewer count did not update: "${watching}"`)

    console.log('')
    if (errors.length) {
      console.log(`✗ ${errors.length} error(s):`)
      for (const e of errors.slice(0, 20)) console.log('   ' + e)
      process.exitCode = 1
    } else {
      console.log('✓ Stream smoke passed: WebRTC signaling + ICE connect over the relay, track attached.')
    }
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  for (const e2 of errors.slice(0, 20)) console.error('   ' + e2)
  process.exit(1)
})
