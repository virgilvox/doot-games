/**
 * The Circuit Cypher arena audio engine: a procedural boom-bap beat plus the
 * SFX and analyser the 3D rap-battle stage rides. Adapted and tidied from the
 * battle mockup. It synthesizes everything with the Web Audio API at runtime, so
 * nothing ships to the network and there is no asset (or library) dependency.
 *
 * Strictly client-only and lazy: nothing touches an AudioContext until `start()`
 * is called (after a user gesture, e.g. the host clicking "Start"). It is
 * SSR-safe (the factory is inert on the server) and a clean no-op where Web Audio
 * is unavailable. The host's mute toggle and `prefers-reduced-motion` govern it.
 *
 *  - the beat is a 32-step (two-bar) kick/snare/hat/bass/stab pattern over a slow
 *    filtered pad, scheduled ahead of the clock so it stays tight;
 *  - `levels()` exposes an AnalyserNode's bass/mid/overall energy + raw bins, so
 *    the 3D stage can bob the robots, pulse the lights, and drive the EQ wall;
 *  - `duck()` pulls the music down under a rapping robot; `airhorn()`, `cheer()`,
 *    and `countBeep()` are the show SFX.
 */

export interface ArenaLevels {
  /** Low-band energy 0..1 (kick/bass) - drives the bob + light pulse. */
  bass: number
  /** Mid-band energy 0..1 - drives beam flicker. */
  mid: number
  /** Overall energy 0..1. */
  all: number
  /** Raw frequency bins (for the EQ wall), or null before audio starts. */
  freq: Uint8Array | null
}

export interface ArenaAudio {
  /** Boot the context (needs a prior user gesture) and start the beat loop. */
  start(): Promise<void>
  /** Stop the loop and release the audio graph. */
  stop(): void
  setMuted(muted: boolean): void
  isMuted(): boolean
  /** Pull the music down (true) under a rapping robot, or back up (false). */
  duck(on: boolean): void
  /** A doubled air-horn stab (round banners, votes, results). */
  airhorn(): void
  /** A swelling crowd-cheer noise burst. */
  cheer(): void
  /** A countdown tick; pass `true` for the final "GO" double-beep. */
  countBeep(go?: boolean): void
  /** Current analyser energy + bins for the stage's per-frame reactivity. */
  levels(): ArenaLevels
  /** Beat phase in beats (for sub-beat-accurate visual sync). */
  beatPhase(): number
}

/** Whether a generated beat can play here (a browser with Web Audio). */
export function canPlayArenaAudio(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown }
  return typeof w.AudioContext !== 'undefined' || typeof w.webkitAudioContext !== 'undefined'
}

export function createArenaAudio(opts: { bpm?: number } = {}): ArenaAudio {
  const bpm = opts.bpm ?? 90
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let music: GainNode | null = null
  let analyser: AnalyserNode | null = null
  // Parameterized to match the DOM lib's getByteFrequencyData signature.
  let freq: Uint8Array<ArrayBuffer> | null = null
  let noiseBuf: AudioBuffer | null = null
  let padStarted = false
  let playing = false
  let muted = false
  let step = 0
  let nextTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function makeNoise(c: AudioContext): AudioBuffer {
    const len = c.sampleRate * 1.0
    const b = c.createBuffer(1, len, c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return b
  }

  function init(): void {
    const w = window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    const c = new Ctor()
    ctx = c
    master = c.createGain()
    master.gain.value = 0.0
    music = c.createGain()
    music.gain.value = 1.0
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 4
    comp.attack.value = 0.003
    comp.release.value = 0.2
    analyser = c.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.78
    freq = new Uint8Array(analyser.frequencyBinCount)
    music.connect(comp)
    comp.connect(master)
    master.connect(analyser)
    analyser.connect(c.destination)
    noiseBuf = makeNoise(c)
    master.gain.linearRampToValueAtTime(muted ? 0.0 : 0.9, c.currentTime + 1.2)
  }

  // ---- instruments ----
  function kick(t: number): void {
    if (!ctx || !music) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(155, t)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09)
    g.gain.setValueAtTime(1.05, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24)
    o.connect(g)
    g.connect(music)
    o.start(t)
    o.stop(t + 0.26)
  }
  function snare(t: number): void {
    if (!ctx || !music || !noiseBuf) return
    const n = ctx.createBufferSource()
    n.buffer = noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1750
    bp.Q.value = 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.7, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    n.connect(bp)
    bp.connect(g)
    g.connect(music)
    n.start(t)
    n.stop(t + 0.22)
    const o = ctx.createOscillator()
    const g2 = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(190, t)
    g2.gain.setValueAtTime(0.35, t)
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    o.connect(g2)
    g2.connect(music)
    o.start(t)
    o.stop(t + 0.13)
  }
  function hat(t: number, open: boolean): void {
    if (!ctx || !music || !noiseBuf) return
    const n = ctx.createBufferSource()
    n.buffer = noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7600
    const g = ctx.createGain()
    const dur = open ? 0.13 : 0.035
    g.gain.setValueAtTime(open ? 0.28 : 0.22, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    n.connect(hp)
    hp.connect(g)
    g.connect(music)
    n.start(t)
    n.stop(t + dur + 0.02)
  }
  function bassNote(t: number, f: number): void {
    if (!ctx || !music) return
    const o = ctx.createOscillator()
    const s = ctx.createOscillator()
    const lp = ctx.createBiquadFilter()
    const g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.value = f
    s.type = 'sine'
    s.frequency.value = f / 2
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(520, t)
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.25)
    lp.Q.value = 6
    g.gain.setValueAtTime(0.0, t)
    g.gain.linearRampToValueAtTime(0.55, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.22)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34)
    o.connect(lp)
    s.connect(lp)
    lp.connect(g)
    g.connect(music)
    o.start(t)
    s.start(t)
    o.stop(t + 0.36)
    s.stop(t + 0.36)
  }
  function stab(t: number, freqs: number[]): void {
    if (!ctx || !music) return
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2400
    lp.Q.value = 1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0, t)
    g.gain.linearRampToValueAtTime(0.16, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    lp.connect(g)
    g.connect(music)
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = (i - 1) * 7
      o.connect(lp)
      o.start(t)
      o.stop(t + 0.22)
    })
  }
  function startPad(): void {
    if (!ctx || !music) return
    const c = ctx
    const pad = c.createGain()
    pad.gain.value = 0.0
    pad.connect(music)
    pad.gain.linearRampToValueAtTime(0.05, c.currentTime + 3)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 620
    lp.Q.value = 2
    lp.connect(pad)
    const lfo = c.createOscillator()
    const lfoG = c.createGain()
    lfo.frequency.value = 0.07
    lfoG.gain.value = 180
    lfo.connect(lfoG)
    lfoG.connect(lp.frequency)
    lfo.start()
    ;[110, 130.81, 164.81].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = (i - 1) * 6
      o.connect(lp)
      o.start()
    })
    padStarted = true
  }

  // ---- pattern over 32 sixteenth-steps (two bars) ----
  const K = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]
  const S = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0]
  const H = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1]
  const HO = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
  function scheduleStep(s: number, t: number): void {
    if (K[s]) kick(t)
    if (S[s]) snare(t)
    if (H[s]) hat(t, HO[s] === 1)
    if (s === 0 || s === 8) bassNote(t, 110)
    if (s === 6) bassNote(t, 110)
    if (s === 14) bassNote(t, 82.41)
    if (s === 16 || s === 24) bassNote(t, 87.31)
    if (s === 22) bassNote(t, 87.31)
    if (s === 30) bassNote(t, 98)
    if (s === 10) stab(t, [220, 261.63, 329.63])
    if (s === 26) stab(t, [174.61, 220, 261.63])
  }
  function loop(): void {
    // Stop re-arming once stopped, otherwise a pending tick keeps the beat going.
    if (!ctx || !playing) return
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(step, nextTime)
      nextTime += 60 / bpm / 4
      step = (step + 1) % 32
    }
    timer = setTimeout(loop, 25)
  }

  // ---- SFX ----
  function beep(t: number, f: number, dur: number, vol: number): void {
    if (!ctx || !master) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = f
    g.gain.setValueAtTime(0.0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  return {
    async start(): Promise<void> {
      if (playing || !canPlayArenaAudio()) return
      try {
        if (!ctx) init()
        await ctx?.resume()
        if (!padStarted) startPad()
        if (playing) return
        playing = true
        step = 0
        nextTime = (ctx?.currentTime ?? 0) + 0.08
        loop()
      } catch {
        playing = false
      }
    },
    stop(): void {
      playing = false
      if (timer) clearTimeout(timer)
      timer = null
      if (master && ctx) {
        try {
          master.gain.cancelScheduledValues(ctx.currentTime)
          master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
        } catch {
          /* ignore */
        }
      }
    },
    setMuted(m: boolean): void {
      muted = m
      if (!ctx || !master) return
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.linearRampToValueAtTime(m ? 0.0 : 0.9, ctx.currentTime + 0.2)
    },
    isMuted(): boolean {
      return muted
    },
    duck(on: boolean): void {
      if (!ctx || !music) return
      music.gain.cancelScheduledValues(ctx.currentTime)
      music.gain.linearRampToValueAtTime(on ? 0.5 : 1.0, ctx.currentTime + (on ? 0.25 : 0.5))
    },
    airhorn(): void {
      if (!ctx || !master) return
      const t = ctx.currentTime
      ;[415.3, 415.3].forEach((f, i) => {
        const o = ctx!.createOscillator()
        const g = ctx!.createGain()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = i * 12
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.18, t + 0.02)
        g.gain.setValueAtTime(0.18, t + 0.5)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.85)
        const lp = ctx!.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 2200
        o.connect(lp)
        lp.connect(g)
        g.connect(master!)
        o.start(t)
        o.stop(t + 0.9)
      })
    },
    cheer(): void {
      if (!ctx || !master || !noiseBuf) return
      const t = ctx.currentTime
      const n = ctx.createBufferSource()
      n.buffer = noiseBuf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(700, t)
      bp.frequency.exponentialRampToValueAtTime(2600, t + 0.5)
      bp.Q.value = 0.7
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0, t)
      g.gain.linearRampToValueAtTime(0.4, t + 0.15)
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4)
      n.connect(bp)
      bp.connect(g)
      g.connect(master)
      n.start(t)
      n.stop(t + 1.5)
    },
    countBeep(go = false): void {
      if (!ctx) return
      const t = ctx.currentTime
      if (go) {
        beep(t, 880, 0.28, 0.22)
        beep(t + 0.01, 1320, 0.3, 0.16)
      } else {
        beep(t, 560, 0.12, 0.16)
      }
    },
    levels(): ArenaLevels {
      if (!analyser || !freq) return { bass: 0, mid: 0, all: 0, freq: null }
      analyser.getByteFrequencyData(freq)
      let b = 0
      let m = 0
      let a = 0
      for (let i = 0; i < 5; i++) b += freq[i] ?? 0
      for (let i = 5; i < 40; i++) m += freq[i] ?? 0
      for (let i = 0; i < freq.length; i++) a += freq[i] ?? 0
      return { bass: b / 5 / 255, mid: m / 35 / 255, all: a / freq.length / 255, freq }
    },
    beatPhase(): number {
      if (!ctx) return 0
      return (ctx.currentTime * bpm) / 60
    },
  }
}
