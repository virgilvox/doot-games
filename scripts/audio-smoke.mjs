/**
 * Real-browser smoke for audio-clip trivia support against a running dev server.
 * Drives the (auth-free) editor preview for a guess round: setting an `audio` URL
 * renders the AudioClip control on the big-screen preview (play/pause does not
 * crash), the phone preview shows a "listen to the big screen" hint, and a broken
 * URL degrades to a clean "couldn't load" no-op. Run:
 *   pnpm dev   # in one shell
 *   node scripts/audio-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ok = (m) => console.log(`  ✓ ${m}`)
const step = (m) => console.log(`• ${m}`)

// A valid (silent, empty) WAV so the <audio> element loads metadata instead of erroring.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    step('Audio clip: editor preview renders the player, the phone hint, and a no-op')
    await page.goto(`${BASE}/editor/guess`)
    const audioInput = page.locator('label.sf-field:has(span.sf-label:text-is("Audio")) input')
    await audioInput.waitFor({ timeout: 40000 })
    ok('opened the guess editor (no login needed)')

    await audioInput.fill(SILENT_WAV)
    await page.click('.ed-pt-btn:has-text("Big screen")')
    await page.waitForSelector('.ed-bs-audio .clip-btn', { timeout: 40000 })
    ok('big-screen preview renders the AudioClip control')

    // Play/pause must not crash (headless may no-op the actual playback, which is fine).
    await page.click('.ed-bs-audio .clip-btn')
    await page.waitForTimeout(200)
    await page.click('.ed-bs-audio .clip-btn')
    if (errors.length) throw new Error(`play/pause raised a page error: ${errors[0]}`)
    ok('play/pause does not crash')

    // The phone preview shows a hint instead of echoing the clip on every device.
    await page.click('.ed-pt-btn:has-text("Phone")')
    await page.waitForSelector('.ed-audio-hint:has-text("big screen")', { timeout: 40000 })
    ok('phone preview shows the "listen to the big screen" hint')

    // A broken URL degrades to a clean "couldn't load" no-op (not a crash).
    await audioInput.fill('https://example.com/definitely-not-audio.mp3')
    await page.click('.ed-pt-btn:has-text("Big screen")')
    await page.waitForSelector('.ed-bs-audio .clip.dead, .ed-bs-audio .clip-dead', { timeout: 40000 })
    if (errors.length) throw new Error(`a broken clip raised a page error: ${errors[0]}`)
    ok('a broken clip degrades to a clean no-op')

    console.log('\nPASS: audio-smoke')
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error('\nFAIL:', e.message)
  process.exit(1)
})
