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

/** Prefer a stable English voice when one is available; fall back to default. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => /^en([-_]|$)/i.test(v.lang)) ?? voices[0]
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
  }

  speakNext()
  return () => {
    cancelled = true
    synth.cancel()
    opts.onDone?.()
  }
}
