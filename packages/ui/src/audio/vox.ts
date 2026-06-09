/**
 * A synthesized "robot vox": a Web Audio stand-in for speechSynthesis that blips
 * one syllable at a time, paced by the text, with a word callback for karaoke
 * highlights. It does not pronounce words; it gives a spoken-cadence robot
 * voice to lines whose TEXT IS ALREADY ON SCREEN (Circuit Cypher verses and MC
 * cards, Open Mic bits), modeled on Quiz or Die's formant villain voice.
 *
 * Why it exists: `speechSynthesis` is rendered by the OS OUTSIDE the tab's audio
 * pipeline, so it never reaches a tab cast / screen share (the "no TTS on the
 * TV" report) and silently fails on devices with no usable voices. Everything
 * here goes through an AudioContext, so it casts with the tab, works on every
 * machine, sounds identical everywhere, and needs no network. Callers fall back
 * to this when `speechLooksSilent()` (speech.ts) or by host choice.
 *
 * SSR-safe and feature-detected throughout; `speakVox` is a clean no-op (calls
 * `onDone`) where Web Audio is missing. The planning half (`voxPlan`) is pure
 * and deterministic, so the pacing math is unit-testable.
 */

export interface VoxPlanOptions {
  /** Base fundamental in Hz (default 130; lower = deeper robot). */
  pitch?: number
  /** Pacing in words per second (default 2.4; a rap verse wants ~2). */
  wordsPerSec?: number
}

export interface VoxEvent {
  /** Seconds from the start of the line. */
  t: number
  /** Blip fundamental in Hz (0 for a consonant noise tick). */
  f: number
  /** Blip length in seconds. */
  dur: number
  /** Index of the word this syllable belongs to (whitespace-split). */
  word: number
  /** The dominant vowel of the syllable, for formant shaping. */
  vowel: string
  /** A leading-consonant noise tick accompanies this syllable. */
  cons: boolean
}

export interface VoxPlanned {
  events: VoxEvent[]
  /** Seconds from start at which each word begins (drives onWord). */
  wordStarts: number[]
  /** Total spoken length in seconds. */
  total: number
}

/** Tiny deterministic jitter from a string, in [-1, 1). Keeps the plan pure. */
function jitter(s: string, k: number): number {
  let h = 2166136261 ^ k
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 2000) / 1000 - 1
}

/**
 * Plan the syllable blips for a line: one blip per vowel group, a small gap per
 * word, a falling phrase contour with a rise on a trailing question mark. Pure
 * and deterministic (same text -> same plan).
 */
export function voxPlan(text: string, opts: VoxPlanOptions = {}): VoxPlanned {
  const base = opts.pitch ?? 130
  const wps = Math.max(0.5, opts.wordsPerSec ?? 2.4)
  const clean = String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  const words = clean ? clean.split(' ') : []
  const events: VoxEvent[] = []
  const wordStarts: number[] = []
  if (!words.length) return { events, wordStarts, total: 0 }
  const question = /\?$/.test(words[words.length - 1] ?? '')
  // Average syllables/word in casual English is ~1.5; size the per-syllable slot
  // so the WORD pace lands at wordsPerSec, then clamp to keep blips blippy.
  const slot = Math.min(0.45, Math.max(0.07, 1 / (wps * 1.5)))
  const gap = slot * 0.5
  let t = 0
  const totalWords = words.length
  for (let w = 0; w < totalWords; w++) {
    const word = words[w] ?? ''
    wordStarts.push(t)
    const vowels = word.match(/[aeiouy]/g) ?? ['a']
    const prog = totalWords > 1 ? w / (totalWords - 1) : 0
    for (let s = 0; s < vowels.length; s++) {
      let f = base * (1 - prog * 0.16) + jitter(word, s) * base * 0.05
      if (s === 0) f += base * 0.06 // word onset leans up, like stress
      if (question && prog > 0.7) f += base * ((prog - 0.7) * 2.2)
      events.push({
        t,
        f,
        dur: slot * 0.8,
        word: w,
        vowel: vowels[s] ?? 'a',
        cons: s === 0 && /^[bcdfghjklmnpqrstvwxz]/.test(word),
      })
      t += slot
    }
    t += gap
  }
  return { events, wordStarts, total: t + 0.12 }
}

/** Rough vowel formant pairs (F1/F2-ish), enough for a robotic mouth shape. */
const FORMANTS: Record<string, [number, number]> = {
  a: [750, 1200],
  e: [550, 1750],
  i: [350, 2100],
  o: [500, 950],
  u: [380, 850],
  y: [350, 1900],
}

let ctx: AudioContext | null = null
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  void ctx.resume().catch(() => {})
  return ctx
}

/** Whether this environment can play the vox (SSR-safe). */
export function canPlayVox(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  )
}

export interface VoxOptions extends VoxPlanOptions {
  /** Output level 0..1 (default 0.5). */
  volume?: number
  /** Fired as each word begins (whitespace-split index), for karaoke. */
  onWord?: (wordIndex: number) => void
  /** Fired once when the line finishes or is cancelled. */
  onDone?: () => void
}

/**
 * Speak a line through the robot vox. Returns a cancel function. Where Web Audio
 * is unavailable, schedules `onWord`/`onDone` on the same pacing with no sound,
 * so a caller's karaoke and show flow never depend on audio existing.
 */
export function speakVox(text: string, opts: VoxOptions = {}): () => void {
  const plan = voxPlan(text, opts)
  if (!plan.events.length) {
    opts.onDone?.()
    return () => {}
  }
  const timers: ReturnType<typeof setTimeout>[] = []
  let done = false
  const finish = () => {
    if (done) return
    done = true
    for (const t of timers) clearTimeout(t)
    opts.onDone?.()
  }
  for (let w = 0; w < plan.wordStarts.length; w++) {
    const at = plan.wordStarts[w] ?? 0
    timers.push(setTimeout(() => opts.onWord?.(w), Math.round(at * 1000)))
  }
  timers.push(setTimeout(finish, Math.round(plan.total * 1000)))

  const c = getCtx()
  let lineGain: GainNode | null = null
  if (c) {
    try {
      lineGain = c.createGain()
      lineGain.gain.value = Math.min(1, Math.max(0, opts.volume ?? 0.5))
      lineGain.connect(c.destination)
      const T0 = c.currentTime + 0.03
      for (const e of plan.events) {
        const [f1, f2] = FORMANTS[e.vowel] ?? FORMANTS.a ?? [750, 1200]
        const osc = c.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = e.f
        const band1 = c.createBiquadFilter()
        band1.type = 'bandpass'
        band1.frequency.value = f1
        band1.Q.value = 7
        const band2 = c.createBiquadFilter()
        band2.type = 'bandpass'
        band2.frequency.value = f2
        band2.Q.value = 8
        const env = c.createGain()
        const at = T0 + e.t
        env.gain.setValueAtTime(0.0001, at)
        env.gain.exponentialRampToValueAtTime(0.5, at + 0.02)
        env.gain.exponentialRampToValueAtTime(0.0001, at + e.dur)
        osc.connect(band1)
        osc.connect(band2)
        band1.connect(env)
        band2.connect(env)
        env.connect(lineGain)
        osc.start(at)
        osc.stop(at + e.dur + 0.03)
        if (e.cons) {
          // A short filtered-noise tick stands in for the leading consonant.
          const len = Math.max(1, Math.floor(c.sampleRate * 0.03))
          const buf = c.createBuffer(1, len, c.sampleRate)
          const data = buf.getChannelData(0)
          let seed = (e.word + 1) * 2654435761
          for (let i = 0; i < len; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            data[i] = (seed / 4294967296 - 0.5) * (1 - i / len)
          }
          const src = c.createBufferSource()
          src.buffer = buf
          const hp = c.createBiquadFilter()
          hp.type = 'highpass'
          hp.frequency.value = 2600
          const ng = c.createGain()
          ng.gain.value = 0.12
          src.connect(hp)
          hp.connect(ng)
          ng.connect(lineGain)
          src.start(at)
        }
      }
    } catch {
      /* sound failed; the timer pacing above still completes the line */
    }
  }
  return () => {
    try {
      lineGain?.disconnect()
    } catch {
      /* ignore */
    }
    finish()
  }
}
