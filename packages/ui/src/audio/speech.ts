/**
 * Client-only text-to-speech for the "robots perform the verses" moment in
 * Circuit Cypher (the rap battle). It is a thin, safe wrapper over the browser
 * `speechSynthesis` API: SSR-guarded and feature-detected, so it is a clean
 * no-op anywhere the API is missing (servers, older browsers, headless test
 * runs) and never blocks or throws. The play flow never depends on it; it is a
 * decorative performance layer.
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
 * Prime the speech engine so the FIRST verse actually speaks. Chrome loads
 * voices lazily and asynchronously: `getVoices()` is often empty on a fresh page
 * until a `voiceschanged` event fires, and a `speak()` issued before then can be
 * silently dropped. Calling this once on mount kicks the load so voices are
 * ready by the time the battle starts. Safe to call repeatedly; a no-op where
 * speech is unavailable.
 */
export function warmUpSpeech(): void {
  if (!canSpeak()) return
  try {
    window.speechSynthesis.getVoices()
    // Some engines need the event listener attached to populate the cache.
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      window.speechSynthesis.getVoices()
    })
  } catch {
    /* ignore */
  }
}

/**
 * Chrome can wedge `speechSynthesis` into a paused state after a `cancel()`, so
 * a following `speak()` produces no sound. Calling `resume()` right after speak
 * unwedges it; it is a harmless no-op when nothing is paused.
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

/** English voices first (most consistent), else whatever the platform offers. */
function englishVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices()
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  return en.length ? en : voices
}

/** Prefer a stable English voice when one is available; fall back to default. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  return englishVoices()[0]
}

/**
 * A performer ("rapper") voice, varied by index so the two robots in a matchup
 * sound like different MCs where the platform offers more than one voice. Falls
 * back to the single available voice (still differentiated by pitch elsewhere).
 */
function performerVoice(index = 0): SpeechSynthesisVoice | undefined {
  const v = englishVoices()
  if (!v.length) return undefined
  return v[index % v.length]
}

/**
 * The announcer/MC voice: deliberately a DIFFERENT voice from the performers
 * when the platform has more than one (the last English voice, least likely to
 * collide with performer index 0/1), so the host narration reads as a separate
 * hype-man. Where only one voice exists, the announcer is set apart by its higher
 * pitch and quicker rate instead.
 */
function announcerVoice(): SpeechSynthesisVoice | undefined {
  const v = englishVoices()
  if (!v.length) return undefined
  return v.length > 2 ? v[v.length - 1] : v[v.length === 2 ? 1 : 0]
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
  synth.cancel() // never stack on top of a prior performance
  const voice = pickVoice()
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
    // On error, don't stall the performance: advance to the next line.
    u.onerror = () => {
      i++
      speakNext()
    }
    synth.speak(u)
    kick(synth)
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
  onDone?: () => void
}

/**
 * Speak a single line in the announcer/MC voice (a distinct persona from the
 * rapping robots). Used by the host to introduce the battle and each performer.
 * A no-op (calls `onDone`) where speech is unavailable. Returns a cancel fn.
 */
export function announce(text: string, opts: AnnounceOptions = {}): () => void {
  const line = text.trim()
  if (!canSpeak() || !line) {
    opts.onDone?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const voice = announcerVoice()
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(line)
  u.rate = opts.rate ?? 1.06
  u.pitch = opts.pitch ?? 1.15
  if (voice) u.voice = voice
  u.onend = () => {
    if (!cancelled) opts.onDone?.()
  }
  u.onerror = () => {
    if (!cancelled) opts.onDone?.()
  }
  try {
    synth.speak(u)
    kick(synth)
  } catch {
    opts.onDone?.()
  }
  return () => {
    cancelled = true
    synth.cancel()
    opts.onDone?.()
  }
}

export interface VerseOptions {
  /** Speaking rate (default 0.95). */
  rate?: number
  /** Voice pitch (default 0.45, a deadpan robot). Vary per side for two MCs. */
  pitch?: number
  /** Which performer voice to use (0 / 1 for the two robots in a matchup). */
  voiceIndex?: number
  /** Fired as each word begins (index into the whitespace-split words). Drives
   *  the karaoke highlight and the jaw chomp. */
  onWord?: (wordIndex: number) => void
  /** Called once when the verse finishes (or playback is cancelled). */
  onDone?: () => void
}

/**
 * Perform a whole verse as one utterance in a performer voice, firing `onWord`
 * at each word boundary so the caller can sync a karaoke highlight + a jaw chomp.
 * Where the browser doesn't emit boundary events the caller should run its own
 * time-based fallback; where speech is unavailable this calls `onDone` at once.
 * Returns a cancel fn.
 */
export function speakVerse(text: string, opts: VerseOptions = {}): () => void {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!canSpeak() || !clean) {
    opts.onDone?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  synth.cancel()
  // Char offset where each word begins, to map a boundary charIndex -> word.
  const words = clean.split(' ')
  const wordStart: number[] = []
  let pos = 0
  for (const w of words) {
    wordStart.push(pos)
    pos += w.length + 1
  }
  const voice = performerVoice(opts.voiceIndex ?? 0)
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(clean)
  u.rate = opts.rate ?? 0.95
  u.pitch = opts.pitch ?? 0.45
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
  try {
    synth.speak(u)
    kick(synth)
  } catch {
    opts.onDone?.()
  }
  return () => {
    cancelled = true
    synth.cancel()
    opts.onDone?.()
  }
}
