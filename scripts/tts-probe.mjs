/**
 * Minimal speechSynthesis probe (no app): reports the available voices, what the
 * Circuit Cypher voice picker would choose, and whether a normal utterance fires
 * `start`/`end` (and how fast). Diagnoses the "no TTS" report at the API level.
 * Run: node scripts/tts-probe.mjs
 */
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false })
try {
  const page = await browser.newPage()
  await page.goto('about:blank')
  // Give the engine a moment + force a voiceschanged load.
  const result = await page.evaluate(async () => {
    const synth = window.speechSynthesis
    const waitVoices = () =>
      new Promise((resolve) => {
        let v = synth.getVoices()
        if (v.length) return resolve(v)
        const t = setTimeout(() => resolve(synth.getVoices()), 3000)
        synth.addEventListener('voiceschanged', () => {
          clearTimeout(t)
          resolve(synth.getVoices())
        })
      })
    const voices = await waitVoices()
    // Mirror packages/ui/src/audio/speech.ts assignVoices(): MC distinct from the
    // robots; both robots share one reliable LOCAL voice (default/first local).
    const FEMALE =
      /\b(samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zoe|nicky|female|zira|aria|jenny|michelle|hazel|eva|sonia|clara|nora)/i
    const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
    const enPool = en.length ? en : voices
    const allUsable = [...enPool.filter((v) => v.localService), ...enPool.filter((v) => !v.localService)]
    const local = allUsable.filter((v) => v.localService)
    const pool = local.length ? local : allUsable
    const robot = pool.find((v) => v.default) ?? pool[0]
    const mc =
      pool.find((v) => v.name !== (robot && robot.name) && FEMALE.test(v.name)) ??
      pool.find((v) => v.name !== (robot && robot.name)) ??
      robot

    // Speak a line in EACH role voice; confirm both actually produce audio.
    const t0 = performance.now()
    const ms = () => Math.round(performance.now() - t0)
    const sayOnce = (voice, text) =>
      new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text)
        if (voice) u.voice = voice
        const log = { voice: voice && voice.name, spoke: 0, start: 0, end: 0, error: null }
        u.onstart = () => {
          log.start = ms()
        }
        u.onend = () => {
          log.end = ms()
          resolve(log)
        }
        u.onerror = (e) => {
          log.error = e.error
          resolve(log)
        }
        synth.cancel()
        log.spoke = ms()
        synth.speak(u)
        synth.resume()
        setTimeout(() => resolve(log), 6000)
      })
    const mcUtt = await sayOnce(mc, 'Welcome to the Circuit Cypher.')
    const robotUtt = await sayOnce(robot, 'My circuits run hot tonight.')

    return {
      voiceCount: voices.length,
      enLocal: local.map((v) => v.name),
      mc: mc ? { name: mc.name, lang: mc.lang, local: mc.localService } : null,
      robot: robot ? { name: robot.name, lang: robot.lang, local: robot.localService, def: robot.default } : null,
      mcDiffersFromRobot: !!mc && !!robot && mc.name !== robot.name,
      mcUtt,
      robotUtt,
    }
  })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
