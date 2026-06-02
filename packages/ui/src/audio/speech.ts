/**
 * Client-only text-to-speech for the "robots perform the verses" moment in
 * Circuit Cypher (the rap battle) and the MC announcer. A thin, safe wrapper over
 * the browser `speechSynthesis` API (the only built-in, cross-platform TTS, and
 * the one that works on mobile): SSR-guarded and feature-detected, so it is a
 * clean no-op anywhere the API is missing (servers, older browsers, headless test
 * runs) and never blocks or throws. The play flow never depends on it; it is a
 * decorative performance layer.
 *
 * Reliability notes (these earned hard, real-browser debugging; see
 * scripts/tts-probe.mjs + scripts/cypher-tts-verify.mjs):
 *  - CHUNK long lines. Chrome/macOS silently STALLS a single utterance that
 *    speaks longer than ~15s: it goes quiet and `onend` fires tens of seconds
 *    late, freezing the show on one card. So we split long MC lines into short,
 *    sentence-sized utterances and queue them; none ever crosses the stall
 *    threshold. (A resume() keepalive is a cheap belt-and-suspenders.)
 *  - DISTINCT LOCAL voices per speaker. We pick the device's on-device
 *    (`localService`) English voices and give the MC, robot A and robot B
 *    *different* ones, chosen by language + availability, NEVER by hardcoded name
 *    (voice names differ per OS; "Samantha" isn't on every Mac, let alone every
 *    phone). Local voices work offline and don't silently fail the way the
 *    network-backed "Google …" voices (Chrome-only) do. If the device has fewer
 *    than three usable voices we fall back to telling them apart by pitch/rate.
 *  - Chrome drops a `speak()` issued the same tick as a `cancel()` of active
 *    speech, so when interrupting we put a short gap between cancel and speak.
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
 * "Start"). Some browsers (notably iOS Safari) drop the FIRST `speak()` of a
 * session unless it follows a real interaction; speaking a near-silent, near-empty
 * utterance now means the first real robot line later (fired from a timer) actually
 * plays. Safe no-op where speech is unavailable.
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
  if (canSpeak()) {
    stopKeepAlive()
    window.speechSynthesis.cancel()
  }
}

// ── Keepalive ───────────────────────────────────────────────────────────────
// Insurance against Chrome wedging mid-queue: while speech is active, nudge the
// engine with resume() (a no-op when not paused, and it never disrupts boundary
// events the way pause() can). Chunking is the real fix; this just catches stalls.
let keepAliveTimer: ReturnType<typeof setInterval> | 0 = 0
function startKeepAlive(synth: SpeechSynthesis): void {
  stopKeepAlive()
  keepAliveTimer = setInterval(() => {
    if (synth.speaking || synth.pending) {
      try {
        synth.resume()
      } catch {
        /* ignore */
      }
    } else {
      stopKeepAlive()
    }
  }, 5000)
}
function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = 0
  }
}

// ── Voice selection ───────────────────────────────────────────────────────────
// A female-leaning name set, used ONLY as a tiebreak so the MC tends to sound
// distinct from the (often male-default) platform voice. Leading word boundary so
// it catches camelCase platform voices (AvaNeural) but not mid-word substrings
// (Slava). Wrong picks here are cosmetic (voice character), never gameplay.
const FEMALE_VOICE =
  /\b(samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zoe|nicky|female|zira|aria|jenny|michelle|hazel|eva|sonia|clara|nora)/i

/**
 * The device's usable voices, English first and LOCAL (on-device) first within
 * that, since local voices work offline and don't silently fail like the
 * network-backed "Google …" voices. Order is stable so role assignment is
 * deterministic across calls (and across clients on the same platform).
 */
function usableVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return []
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  const pool = en.length ? en : voices
  const local = pool.filter((v) => v.localService)
  const net = pool.filter((v) => !v.localService)
  return [...local, ...net]
}

export type VoiceRole = 'mc' | 'robotA' | 'robotB'

/**
 * Assign voices so the MC sounds DIFFERENT from the rappers, while never gambling
 * on a voice that might be silent. The hard lesson (the "silent second robot"
 * bug): a per-robot voice can produce NO audio on a given device (an undownloaded
 * macOS premium voice, a network voice offline), so giving robot A and robot B
 * their own voices makes one go quiet. Instead:
 *  - BOTH robots share ONE reliable voice (the platform default / first LOCAL
 *    one - the voice most likely to actually play), told apart by pitch/rate. If
 *    one robot is audible, the other is too.
 *  - The MC takes a DIFFERENT local voice (female-leaning for character), or falls
 *    back to the robot voice on a one-voice device (a working shared voice beats a
 *    silent "distinct" one).
 * Local-only: network voices (Chrome's "Google …") are the silent-failure risk, so
 * they're used only if the device has NO local voice at all. Recomputed each call
 * so it self-heals once voices finish loading.
 */
function assignVoices(): { mc?: SpeechSynthesisVoice; robotA?: SpeechSynthesisVoice; robotB?: SpeechSynthesisVoice } {
  const all = usableVoices()
  if (!all.length) return {}
  const local = all.filter((v) => v.localService)
  const pool = local.length ? local : all // network only as a last resort
  const robot = pool.find((v) => v.default) ?? pool[0]
  const mc =
    pool.find((v) => v.name !== robot?.name && FEMALE_VOICE.test(v.name)) ??
    pool.find((v) => v.name !== robot?.name) ??
    robot
  // Both robots use the same proven voice; pitch/rate (set by the caller) make the
  // two performers sound distinct without risking a silent side.
  return { mc, robotA: robot, robotB: robot }
}

function voiceForRole(role: VoiceRole): SpeechSynthesisVoice | undefined {
  const a = assignVoices()
  if (role === 'mc') return a.mc
  if (role === 'robotB') return a.robotB
  return a.robotA
}

/**
 * Split text into short, sentence-sized chunks (<= `max` chars) so no single
 * utterance crosses the ~15s Chrome stall threshold. Splits on sentence
 * punctuation first, then hard-wraps any over-long remainder at a space. Pure.
 */
export function chunkText(text: string, max = 120): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const out: string[] = []
  for (const s of sentences) {
    let t = s.trim()
    if (!t) continue
    while (t.length > max) {
      let cut = t.lastIndexOf(' ', max)
      if (cut <= 0) cut = max
      out.push(t.slice(0, cut).trim())
      t = t.slice(cut).trim()
    }
    if (t) out.push(t)
  }
  return out
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

/**
 * Queue a list of already-clean text chunks through one voice, sequentially, with
 * the given utterance shape. Fires `onStart` once (first chunk actually begins),
 * `onLine` per chunk, and `onDone` once (all finished / cancelled / failed).
 * Returns a cancel fn. Shared by speakLines and announce. Assumes `canSpeak()`.
 */
function speakQueue(
  chunks: string[],
  shape: (u: SpeechSynthesisUtterance) => void,
  cbs: { onStart?: () => void; onLine?: (i: number) => void; onDone?: () => void },
): () => void {
  const synth = window.speechSynthesis
  let cancelled = false
  let started = false
  let settled = false
  let i = 0
  const finish = () => {
    if (settled) return
    settled = true
    stopKeepAlive()
    cbs.onDone?.()
  }
  const next = () => {
    if (cancelled) return
    if (i >= chunks.length) {
      finish()
      return
    }
    const u = new window.SpeechSynthesisUtterance(chunks[i])
    shape(u)
    cbs.onLine?.(i)
    u.onstart = () => {
      if (!started && !cancelled) {
        started = true
        cbs.onStart?.()
      }
    }
    u.onend = () => {
      i++
      next()
    }
    u.onerror = () => {
      i++
      next()
    }
    // The first chunk may interrupt prior speech; later chunks fire from onend
    // with nothing active, so they speak immediately.
    if (i === 0) {
      speakSoon(synth, u, () => cancelled, () => {
        i++
        next()
      })
    } else {
      synth.speak(u)
      kick(synth)
    }
  }
  startKeepAlive(synth)
  next()
  return () => {
    if (settled) return
    cancelled = true
    settled = true
    stopKeepAlive()
    synth.cancel()
    cbs.onDone?.()
  }
}

export interface SpeakOptions {
  /** Speaking rate (0.1–10, default 0.95 for a deliberate flow). */
  rate?: number
  /** Voice pitch (0–2, default 0.5 for a deadpan robot). */
  pitch?: number
  /** Which assigned voice to use (default robot A). */
  role?: VoiceRole
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
  // One utterance per line so `onLine(i)` stays aligned to the caller's line index
  // (VoteHost highlights answer i as it's performed). Lines here are short (a quip
  // answer is <=140 chars, well under the ~15s stall threshold), so no chunking.
  const clean = lines.map((l) => l.trim()).filter(Boolean)
  if (!canSpeak() || clean.length === 0) {
    opts.onDone?.()
    return () => {}
  }
  const voice = voiceForRole(opts.role ?? 'robotA')
  return speakQueue(
    clean,
    (u) => {
      u.rate = opts.rate ?? 0.95
      u.pitch = opts.pitch ?? 0.5
      if (voice) u.voice = voice
    },
    { onLine: opts.onLine, onDone: opts.onDone },
  )
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
 * Speak a single MC/announcer line (chunked so a long line can't stall). A
 * brighter, quicker voice than the deadpan robots, and a DIFFERENT device voice
 * where one is available. A no-op (calls `onDone`) where speech is unavailable.
 * Returns a cancel fn.
 */
export function announce(text: string, opts: AnnounceOptions = {}): () => void {
  const chunks = chunkText(text.trim())
  if (!canSpeak() || !chunks.length) {
    opts.onDone?.()
    return () => {}
  }
  const voice = voiceForRole('mc')
  return speakQueue(
    chunks,
    (u) => {
      u.rate = opts.rate ?? 1.06
      u.pitch = opts.pitch ?? 1.15
      if (voice) u.voice = voice
    },
    { onStart: opts.onStart, onDone: opts.onDone },
  )
}

export interface VerseOptions {
  /** Speaking rate (default 0.95). */
  rate?: number
  /** Voice pitch (default 0.6, a deadpan robot). Vary per side so the two robots
   *  sound distinct on their shared voice (deep left vs bright right). */
  pitch?: number
  /** Which robot is performing. Both robots share one reliable voice (kept apart
   *  by pitch/rate, never by a per-side voice that might be silent); `side` is
   *  carried for the caller's own use and future device-specific tuning. Default 'a'. */
  side?: 'a' | 'b'
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
 * A verse is short (a few lines) so it stays one utterance for clean boundaries.
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
  const voice = voiceForRole(opts.side === 'b' ? 'robotB' : 'robotA')
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
    stopKeepAlive()
    if (!cancelled) opts.onDone?.()
  }
  u.onerror = () => {
    stopKeepAlive()
    if (!cancelled) opts.onDone?.()
  }
  startKeepAlive(synth)
  speakSoon(synth, u, () => cancelled, () => {
    stopKeepAlive()
    if (!cancelled) opts.onDone?.()
  })
  return () => {
    cancelled = true
    stopKeepAlive()
    synth.cancel()
    opts.onDone?.()
  }
}
