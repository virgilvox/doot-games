/**
 * Client-only text-to-speech for the "robots perform the verses" moment in
 * Circuit Cypher (the rap battle) and the MC announcer. A thin, safe wrapper over
 * the browser `speechSynthesis` API: SSR-guarded and feature-detected, so it is a
 * clean no-op anywhere the API is missing (servers, older browsers, headless test
 * runs) and never blocks or throws. The play flow never depends on it; it is a
 * decorative performance layer.
 *
 * Reliability notes (these earned real debugging time, see scripts/tts-probe.mjs):
 *  - We speak EVERYTHING through ONE voice (the platform default / a local voice)
 *    and tell the MC + the two robots apart by PITCH and RATE. The old code gave
 *    each robot a different *platform* voice by index; on machines where the
 *    second voice doesn't actually produce audio, the second robot went silent
 *    while the first played. Pitch/rate on a single known-good voice can't fail
 *    that way.
 *  - Chrome/macOS silently DROPS a `speak()` issued in the same tick as a
 *    `cancel()` of actively-playing speech. So when we're interrupting live
 *    speech we put a short gap between the cancel and the speak; when nothing is
 *    speaking we speak immediately.
 */

/** Whether the browser can speak (SSR-safe, feature-detected). */
export function canSpeak(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

/**
 * Prime the speech engine so the FIRST line actually speaks. Chrome loads voices
 * lazily and asynchronously: `getVoices()` is often empty on a fresh page until a
 * `voiceschanged` event fires, and a `speak()` issued before then can be silently
 * dropped. Calling this once on mount kicks the load so voices are ready by the
 * time the battle starts. Safe to call repeatedly; a no-op where speech is
 * unavailable.
 */
let voicesWarmed = false
export function warmUpSpeech(): void {
  if (!canSpeak()) return
  try {
    window.speechSynthesis.getVoices()
    if (!voicesWarmed) {
      voicesWarmed = true
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        window.speechSynthesis.getVoices()
      })
    }
  } catch {
    /* ignore */
  }
}

/**
 * Activate the speech engine from inside a user gesture (e.g. the host pressing
 * "Start"). Some browsers drop the FIRST `speak()` of a session unless it follows
 * a real interaction; speaking a near-silent, near-empty utterance now means the
 * first real robot line later (fired from a timer) actually plays. Safe no-op
 * where speech is unavailable.
 */
export function primeSpeech(): void {
  if (!canSpeak()) return
  try {
    const synth = window.speechSynthesis
    synth.getVoices()
    const u = new window.SpeechSynthesisUtterance(' ')
    u.volume = 0
    synth.cancel()
    synth.speak(u)
    synth.resume()
  } catch {
    /* ignore */
  }
}

/**
 * Chrome can wedge `speechSynthesis` into a paused state after a `cancel()`, so a
 * following `speak()` produces no sound. Calling `resume()` unwedges it; harmless
 * no-op when nothing is paused.
 */
function kick(synth: SpeechSynthesis): void {
  try {
    synth.resume()
  } catch {
    /* ignore */
  }
}

/** Stop anything currently being spoken. */
export function cancelSpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
}

/**
 * The single voice we use for ALL speech. Prefer the platform default, then any
 * LOCAL (non-network) English voice, then any English, then anything. Local
 * voices are the reliable ones; network voices can fail silently. The MC and the
 * two robots are differentiated by pitch/rate, not by choosing different voices.
 */
// Well-known female voice names across macOS / Windows / Chrome / Android, plus an
// explicit "female" marker. The Circuit Cypher MC has always been a female voice
// (on macOS the default is "Samantha"); we pick one explicitly rather than trusting
// the platform `default` flag, which Chrome does not reliably set, so it would
// otherwise fall back to whatever local voice sorts first (often a male one).
const FEMALE_VOICE =
  /(samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zoe|nicky|female|zira|aria|jenny|michelle|hazel|eva|sonia|clara|nora)/i

function reliableVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return undefined
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  const pool = en.length ? en : voices
  return (
    pool.find((v) => v.localService && FEMALE_VOICE.test(v.name)) ?? // reliable + female (e.g. Samantha)
    pool.find((v) => v.default && v.localService) ??
    pool.find((v) => v.localService) ??
    pool.find((v) => FEMALE_VOICE.test(v.name)) ?? // a female voice even if network-backed
    pool.find((v) => v.default) ??
    pool[0]
  )
}

// Chrome drops a speak() issued the same tick as a cancel() of ACTIVE speech, so
// when interrupting we wait a beat before speaking. Idle -> speak immediately.
const SPEAK_DELAY_MS = 140

/**
 * Speak one utterance. If something is currently speaking we cancel it and defer
 * the new speak briefly (so it isn't dropped); otherwise we speak at once. Calls
 * `onFail` if the synth throws synchronously.
 */
function speakSoon(synth: SpeechSynthesis, u: SpeechSynthesisUtterance, isCancelled: () => boolean, onFail: () => void): void {
  const busy = synth.speaking || synth.pending
  synth.cancel()
  const go = () => {
    if (isCancelled()) return
    try {
      synth.speak(u)
      kick(synth)
    } catch {
      onFail()
    }
  }
  if (busy) setTimeout(go, SPEAK_DELAY_MS)
  else go()
}

export interface SpeakOptions {
  /** Speaking rate (0.1–10, default 0.95 for a deliberate flow). */
  rate?: number
  /** Voice pitch (0–2, default 0.5 for a deadpan robot). */
  pitch?: number
  /** Called with the index of each line as it starts. */
  onLine?: (index: number) => void
  /** Called once when every line has finished (or playback is cancelled). */
  onDone?: () => void
}

/**
 * Speak `lines` one after another with a deadpan, robotic cadence. Returns a
 * cancel function. A no-op (calls `onDone` immediately) where speech is
 * unavailable, so callers can always wire it up unconditionally.
 */
export function speakLines(lines: string[], opts: SpeakOptions = {}): () => void {
  const clean = lines.map((l) => l.trim()).filter(Boolean)
  if (!canSpeak() || clean.length === 0) {
    opts.onDone?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  const voice = reliableVoice()
  let cancelled = false
  let i = 0

  const speakNext = () => {
    if (cancelled) return
    if (i >= clean.length) {
      opts.onDone?.()
      return
    }
    const u = new window.SpeechSynthesisUtterance(clean[i])
    u.rate = opts.rate ?? 0.95
    u.pitch = opts.pitch ?? 0.5
    if (voice) u.voice = voice
    opts.onLine?.(i)
    u.onend = () => {
      i++
      speakNext()
    }
    u.onerror = () => {
      i++
      speakNext()
    }
    // The first line may interrupt prior speech; later lines fire from onend with
    // nothing active, so they speak immediately.
    if (i === 0) {
      speakSoon(synth, u, () => cancelled, () => {
        i++
        speakNext()
      })
    } else {
      synth.speak(u)
      kick(synth)
    }
  }

  speakNext()
  return () => {
    cancelled = true
    synth.cancel()
    opts.onDone?.()
  }
}

export interface AnnounceOptions {
  /** Speaking rate (default 1.06, a touch quick and hype). */
  rate?: number
  /** Voice pitch (default 1.15, brighter than the deadpan performers). */
  pitch?: number
  /** Fired when the line actually begins speaking. Lets a caller tell a working
   *  voice from one the browser silently dropped (which never starts), so the
   *  show can keep pace instead of waiting out a long fallback cap. */
  onStart?: () => void
  onDone?: () => void
}

/**
 * Speak a single line in the announcer/MC voice. Same underlying voice as the
 * robots, set apart by a brighter pitch and quicker rate. A no-op (calls
 * `onDone`) where speech is unavailable. Returns a cancel fn.
 */
export function announce(text: string, opts: AnnounceOptions = {}): () => void {
  const line = text.trim()
  if (!canSpeak() || !line) {
    opts.onDone?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  const voice = reliableVoice()
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(line)
  u.rate = opts.rate ?? 1.06
  u.pitch = opts.pitch ?? 1.15
  if (voice) u.voice = voice
  u.onstart = () => {
    if (!cancelled) opts.onStart?.()
  }
  u.onend = () => {
    if (!cancelled) opts.onDone?.()
  }
  u.onerror = () => {
    if (!cancelled) opts.onDone?.()
  }
  speakSoon(synth, u, () => cancelled, () => {
    if (!cancelled) opts.onDone?.()
  })
  return () => {
    cancelled = true
    synth.cancel()
    opts.onDone?.()
  }
}

export interface VerseOptions {
  /** Speaking rate (default 0.95). */
  rate?: number
  /** Voice pitch (default 0.6, a deadpan robot). Vary per side so the two robots
   *  sound distinct on the shared voice. */
  pitch?: number
  /** Fired as each word begins (index into the whitespace-split words). Drives
   *  the karaoke highlight and the jaw chomp. */
  onWord?: (wordIndex: number) => void
  /** Called once when the verse finishes (or playback is cancelled). */
  onDone?: () => void
}

/**
 * Perform a whole verse as one utterance, firing `onWord` at each word boundary
 * so the caller can sync a karaoke highlight + a jaw chomp. Where the browser
 * doesn't emit boundary events the caller should run its own time-based fallback;
 * where speech is unavailable this calls `onDone` at once. Returns a cancel fn.
 */
export function speakVerse(text: string, opts: VerseOptions = {}): () => void {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!canSpeak() || !clean) {
    opts.onDone?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  // Char offset where each word begins, to map a boundary charIndex -> word.
  const words = clean.split(' ')
  const wordStart: number[] = []
  let pos = 0
  for (const w of words) {
    wordStart.push(pos)
    pos += w.length + 1
  }
  const voice = reliableVoice()
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(clean)
  u.rate = opts.rate ?? 0.95
  u.pitch = opts.pitch ?? 0.6
  if (voice) u.voice = voice
  u.onboundary = (e) => {
    if (cancelled || (e.name && e.name !== 'word')) return
    let k = 0
    for (let j = 0; j < wordStart.length; j++) if (e.charIndex >= (wordStart[j] ?? 0)) k = j
    opts.onWord?.(k)
  }
  u.onend = () => {
    if (!cancelled) opts.onDone?.()
  }
  u.onerror = () => {
    if (!cancelled) opts.onDone?.()
  }
  speakSoon(synth, u, () => cancelled, () => {
    if (!cancelled) opts.onDone?.()
  })
  return () => {
    cancelled = true
    synth.cancel()
    opts.onDone?.()
  }
}
