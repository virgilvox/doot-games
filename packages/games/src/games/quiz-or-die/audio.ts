/**
 * The QUIZ OR DIE horror audio engine, ported from the single-file mockup's `SOUND`
 * module. It synthesizes everything with the Web Audio API at runtime: an eerie
 * drone bed with a breathing filter + wind, a wandering minor celesta motif, a
 * heartbeat, the show one-shot SFX, and a formant "wrong voice" for the villain
 * (an always-audible synth alternative to the OS TTS).
 *
 * Strictly client-only and lazy, like `arena.ts`: nothing touches an AudioContext
 * until `start()` is called from a user gesture (the lobby's "Begin" button). The
 * factory is inert on the server and a clean no-op where Web Audio is unavailable.
 */

export type HorrorMode = 'off' | 'lobby' | 'play' | 'tension' | 'final'

export interface HorrorAudio {
  /** Boot the context (needs a prior user gesture) and build the eerie bed. */
  start(): Promise<void>
  /** Resume a suspended context (e.g. after a tab returns to the foreground). */
  resume(): void
  stop(): void
  setMuted(muted: boolean): void
  isMuted(): boolean
  /** Toggle just the music bed, leaving SFX audible. */
  setMusic(on: boolean): void
  /** Switch the music bed mood. */
  setMode(mode: HorrorMode): void
  /** The one-shot show SFX. */
  sfx: HorrorSfx
  /** A wailing ghost swell. */
  ghostWail(gain?: number): void
  /** A rising victory fanfare. */
  victory(): void
  /** The villain's synthesized formant voice, sized to `ms` (always audible). */
  voice(text: string, ms: number): void
}

export interface HorrorSfx {
  tick(): void
  correct(): void
  wrong(): void
  sting(): void
  reveal(): void
  death(): void
  explode(): void
  slice(): void
  coin(): void
  gulp(): void
  spin(): void
  diceroll(): void
  select(): void
  whoosh(): void
  bodysteal(): void
  escape(): void
  gameover(): void
}

/** Whether synthesized audio can play here (a browser with Web Audio). */
export function canPlayHorrorAudio(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown }
  return !!(w.AudioContext || w.webkitAudioContext)
}

const NOOP_SFX: HorrorSfx = {
  tick() {}, correct() {}, wrong() {}, sting() {}, reveal() {}, death() {}, explode() {},
  slice() {}, coin() {}, gulp() {}, spin() {}, diceroll() {}, select() {}, whoosh() {},
  bodysteal() {}, escape() {}, gameover() {},
}

/**
 * Build the (inert until `start()`) horror audio engine. Safe to call on the
 * server and where Web Audio is missing: every method becomes a no-op.
 */
export function createHorrorAudio(): HorrorAudio {
  if (!canPlayHorrorAudio()) {
    return {
      async start() {}, resume() {}, stop() {}, setMuted() {}, isMuted: () => true,
      setMusic() {}, setMode() {}, sfx: NOOP_SFX, ghostWail() {}, victory() {}, voice() {},
    }
  }

  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let musicBus: GainNode | null = null
  let sfxBus: GainNode | null = null
  let droneGain: GainNode | null = null
  const drone: OscillatorNode[] = []
  let windNode: AudioBufferSourceNode | null = null
  let motifTimer: ReturnType<typeof setInterval> | null = null
  let heartTimer: ReturnType<typeof setInterval> | null = null
  let mode: HorrorMode = 'off'
  let muted = false
  let musicOn = true

  const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a

  function noiseBuffer(sec: number): AudioBuffer {
    const c = ctx as AudioContext
    const len = c.sampleRate * sec
    const b = c.createBuffer(1, len, c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return b
  }

  function buildBed() {
    const c = ctx as AudioContext
    droneGain = c.createGain()
    droneGain.gain.value = 0
    droneGain.connect(musicBus as GainNode)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    lp.Q.value = 2
    lp.connect(droneGain)
    ;[55, 55.6, 82.5].forEach((f, i) => {
      const o = c.createOscillator()
      o.type = i === 2 ? 'triangle' : 'sawtooth'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = i === 2 ? 0.12 : 0.2
      o.connect(g)
      g.connect(lp)
      o.start()
      drone.push(o)
    })
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.06
    const lg = c.createGain()
    lg.gain.value = 180
    lfo.connect(lg)
    lg.connect(lp.frequency)
    lfo.start()
    const wn = noiseBuffer(2)
    windNode = c.createBufferSource()
    windNode.buffer = wn
    windNode.loop = true
    const wf = c.createBiquadFilter()
    wf.type = 'bandpass'
    wf.frequency.value = 520
    wf.Q.value = 0.7
    const wg = c.createGain()
    wg.gain.value = 0.05
    windNode.connect(wf)
    wf.connect(wg)
    wg.connect(droneGain)
    const wlfo = c.createOscillator()
    wlfo.frequency.value = 0.08
    const wlg = c.createGain()
    wlg.gain.value = 0.04
    wlfo.connect(wlg)
    wlg.connect(wg.gain)
    wlfo.start()
    windNode.start()
  }

  function tone({
    f = 440, t = 'sine', d = 0.4, g = 0.3, when = 0, gl = null, a = 0.01, bus = null,
  }: { f?: number; t?: OscillatorType; d?: number; g?: number; when?: number; gl?: number | null; a?: number; bus?: AudioNode | null } = {}) {
    if (!ctx) return
    const T = ctx.currentTime + when
    const o = ctx.createOscillator()
    o.type = t
    o.frequency.setValueAtTime(f, T)
    if (gl) o.frequency.exponentialRampToValueAtTime(Math.max(20, gl), T + d)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, T)
    env.gain.exponentialRampToValueAtTime(g, T + a)
    env.gain.exponentialRampToValueAtTime(0.0001, T + d)
    o.connect(env)
    env.connect(bus || (sfxBus as GainNode))
    o.start(T)
    o.stop(T + d + 0.05)
  }

  function noiseHit({
    d = 0.3, g = 0.4, when = 0, type = 'lowpass', f = 800, q = 1,
  }: { d?: number; g?: number; when?: number; type?: BiquadFilterType; f?: number; q?: number } = {}) {
    if (!ctx) return
    const T = ctx.currentTime + when
    const s = ctx.createBufferSource()
    s.buffer = noiseBuffer(d + 0.05)
    const flt = ctx.createBiquadFilter()
    flt.type = type
    flt.frequency.value = f
    flt.Q.value = q
    const env = ctx.createGain()
    env.gain.setValueAtTime(g, T)
    env.gain.exponentialRampToValueAtTime(0.0001, T + d)
    s.connect(flt)
    flt.connect(env)
    env.connect(sfxBus as GainNode)
    s.start(T)
    s.stop(T + d + 0.05)
  }

  function scheduleMotif(every: number, urgent = false) {
    const scale = [440, 523.25, 587.33, 698.46, 659.25, 587.33, 523.25, 392]
    const play = () => {
      if (mode === 'off') return
      const n = urgent ? 5 : 4
      const start = ri(0, scale.length - n)
      for (let i = 0; i < n; i++) {
        const f = (scale[(start + i) % scale.length] as number) * (Math.random() < 0.2 ? 0.5 : 1)
        tone({ f, t: 'triangle', d: urgent ? 0.5 : 0.9, g: 0.07, when: i * (urgent ? 0.16 : 0.28), bus: musicBus })
        tone({ f: f * 2, t: 'sine', d: 0.5, g: 0.02, when: i * (urgent ? 0.16 : 0.28), bus: musicBus })
      }
    }
    play()
    motifTimer = setInterval(play, every)
  }

  function heartbeat(on: boolean, period = 0.85) {
    if (heartTimer) clearInterval(heartTimer)
    heartTimer = null
    if (!on || !ctx) return
    const beat = () => {
      tone({ f: 64, t: 'sine', d: 0.18, g: 0.5, gl: 42 })
      tone({ f: 58, t: 'sine', d: 0.22, g: 0.4, gl: 38, when: 0.16 })
    }
    beat()
    heartTimer = setInterval(beat, period * 1000)
  }

  function ghostWail(g = 0.5) {
    tone({ f: 300, t: 'sine', d: 1.4, g: g * 0.3, gl: 150 })
    tone({ f: 305, t: 'sine', d: 1.4, g: g * 0.22, gl: 148 })
    tone({ f: 600, t: 'sine', d: 1.0, g: g * 0.1, gl: 300 })
  }

  const sfx: HorrorSfx = {
    tick() { tone({ f: 1500, t: 'square', d: 0.03, g: 0.12 }) },
    correct() {
      tone({ f: 659.25, t: 'triangle', d: 0.5, g: 0.3 })
      tone({ f: 987.77, t: 'triangle', d: 0.6, g: 0.22, when: 0.12 })
      tone({ f: 1318.5, t: 'sine', d: 0.7, g: 0.14, when: 0.22 })
    },
    wrong() {
      tone({ f: 155, t: 'sawtooth', d: 0.5, g: 0.32, gl: 90 })
      tone({ f: 148, t: 'square', d: 0.5, g: 0.2, gl: 84 })
      noiseHit({ d: 0.4, g: 0.15, type: 'lowpass', f: 300 })
    },
    sting() {
      ;[330, 392, 415, 247].forEach((f, i) => tone({ f, t: 'sawtooth', d: 0.6, g: 0.16, when: i * 0.005 }))
      noiseHit({ d: 0.3, g: 0.18, type: 'highpass', f: 2000 })
    },
    reveal() {
      tone({ f: 220, t: 'triangle', d: 0.7, g: 0.18, gl: 330 })
      tone({ f: 330, t: 'sine', d: 0.5, g: 0.12, when: 0.1 })
    },
    death() {
      tone({ f: 380, t: 'sawtooth', d: 1.1, g: 0.34, gl: 46 })
      tone({ f: 220, t: 'square', d: 1.0, g: 0.2, gl: 30, when: 0.05 })
      noiseHit({ d: 0.5, g: 0.4, type: 'lowpass', f: 200 })
      ghostWail(0.6)
    },
    explode() {
      noiseHit({ d: 0.7, g: 0.7, type: 'lowpass', f: 600, q: 0.5 })
      tone({ f: 90, t: 'square', d: 0.6, g: 0.5, gl: 30 })
      noiseHit({ d: 0.4, g: 0.4, type: 'highpass', f: 1500, when: 0.02 })
    },
    slice() {
      noiseHit({ d: 0.18, g: 0.5, type: 'highpass', f: 3000 })
      tone({ f: 1800, t: 'sawtooth', d: 0.18, g: 0.2, gl: 300 })
    },
    coin() {
      tone({ f: 1200, t: 'square', d: 0.5, g: 0.18, gl: 600 })
      tone({ f: 1600, t: 'square', d: 0.4, g: 0.12, gl: 800, when: 0.04 })
    },
    gulp() {
      tone({ f: 160, t: 'sine', d: 0.25, g: 0.3, gl: 70 })
      tone({ f: 120, t: 'sine', d: 0.25, g: 0.25, gl: 55, when: 0.12 })
    },
    spin() {
      for (let i = 0; i < 26; i++) tone({ f: 600 + ri(-60, 60), t: 'square', d: 0.04, g: 0.07, when: i * (0.06 + i * 0.006) })
    },
    diceroll() {
      for (let i = 0; i < 8; i++) noiseHit({ d: 0.06, g: 0.18, type: 'bandpass', f: ri(800, 1600), when: i * 0.05 })
    },
    select() { tone({ f: 520, t: 'square', d: 0.06, g: 0.14 }) },
    whoosh() { noiseHit({ d: 0.4, g: 0.25, type: 'bandpass', f: 900, q: 0.6 }) },
    bodysteal() {
      ghostWail(0.4)
      tone({ f: 200, t: 'sawtooth', d: 0.9, g: 0.28, gl: 520 })
      noiseHit({ d: 0.5, g: 0.2, type: 'highpass', f: 1800 })
    },
    escape() {
      ;[392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, t: 'triangle', d: 0.7, g: 0.22, when: i * 0.12 }))
    },
    gameover() {
      ;[196, 185, 174.6, 164.8].forEach((f, i) => tone({ f, t: 'sawtooth', d: 1.6, g: 0.22, when: i * 0.5, gl: f * 0.6 }))
      ghostWail(1.4)
    },
  }

  function victory() {
    const seq: Array<[number, number]> = [
      [523.25, 0], [659.25, 0.18], [783.99, 0.36], [1046.5, 0.54], [783.99, 0.78], [1046.5, 0.96], [1318.5, 1.2],
    ]
    for (const [f, w] of seq) {
      tone({ f, t: 'triangle', d: 0.8, g: 0.24, when: w, bus: musicBus })
      tone({ f: f * 0.5, t: 'sine', d: 1.0, g: 0.12, when: w, bus: musicBus })
    }
  }

  // ── Synth "wrong voice": formant blips synced to the text, always audible ──
  const DEFAULT_FORMANT: [number, number] = [760, 1200]
  const VF: Record<string, [number, number]> = {
    a: [760, 1200], e: [530, 1840], i: [320, 2300], o: [470, 820], u: [330, 760], y: [300, 2100],
  }
  function blip(f: number, formants: [number, number], when: number, dur: number) {
    if (!ctx) return
    const T = ctx.currentTime + when
    const src = ctx.createOscillator()
    src.type = 'sawtooth'
    src.frequency.setValueAtTime(f, T)
    src.frequency.linearRampToValueAtTime(f * (ri(92, 108) / 100), T + dur)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, T)
    env.gain.exponentialRampToValueAtTime(0.45, T + 0.014)
    env.gain.exponentialRampToValueAtTime(0.0001, T + dur)
    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'
    f1.frequency.value = formants[0]
    f1.Q.value = 7
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'
    f2.frequency.value = formants[1]
    f2.Q.value = 8
    const mix = ctx.createGain()
    mix.gain.value = 0.22
    src.connect(f1)
    src.connect(f2)
    f1.connect(env)
    f2.connect(env)
    env.connect(mix)
    mix.connect(sfxBus as GainNode)
    src.start(T)
    src.stop(T + dur + 0.03)
  }
  function voice(text: string, ms: number) {
    if (!ctx) return
    const clean = String(text).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim().toLowerCase()
    if (!clean) return
    const question = /\?\s*$/.test(clean)
    const syl: Array<{ v?: string; first?: boolean; cons?: boolean; space?: boolean }> = []
    for (const w of clean.split(/\s+/)) {
      const vs = w.match(/[aeiouy]/g) || ['a']
      vs.forEach((v, i) => syl.push({ v, first: i === 0, cons: i === 0 && /^[bcdfghjklmnpqrstvwxz]/.test(w) }))
      syl.push({ space: true })
    }
    const n = syl.filter((u) => !u.space).length || 1
    const slot = Math.min(0.16, Math.max(0.075, ms / 1000 / Math.max(n * 1.18, 1)))
    let when = 0
    let k = 0
    for (const u of syl) {
      if (u.space) {
        when += slot * 0.45
        continue
      }
      const prog = k / Math.max(n - 1, 1)
      k++
      let f = 134 - prog * 26 + (u.first ? 9 : 0) + ri(-5, 5)
      if (question && prog > 0.7) f += (prog - 0.7) * 130
      if (u.cons && Math.random() < 0.7) noiseHit({ d: 0.03, g: 0.09, type: 'highpass', f: 2600, when })
      blip(f, VF[u.v as string] ?? DEFAULT_FORMANT, when, slot * 0.8)
      when += slot
    }
  }

  function setMode(m: HorrorMode) {
    mode = m
    if (!ctx || !droneGain) return
    const now = ctx.currentTime
    const target = m === 'off' ? 0 : m === 'lobby' ? 0.5 : m === 'tension' ? 0.75 : m === 'final' ? 1.0 : 0.55
    droneGain.gain.cancelScheduledValues(now)
    droneGain.gain.linearRampToValueAtTime(musicOn ? target : 0, now + 1.2)
    if (motifTimer) clearInterval(motifTimer)
    motifTimer = null
    if (m === 'lobby' || m === 'play') scheduleMotif(m === 'lobby' ? 4200 : 6500)
    if (m === 'tension' || m === 'final') heartbeat(true, m === 'final' ? 0.62 : 0.85)
    else heartbeat(false)
    if (m === 'final') scheduleMotif(2600, true)
  }

  return {
    async start() {
      if (ctx) return
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.9
      master.connect(ctx.destination)
      musicBus = ctx.createGain()
      musicBus.gain.value = 0.55
      musicBus.connect(master)
      sfxBus = ctx.createGain()
      sfxBus.gain.value = 0.9
      sfxBus.connect(master)
      buildBed()
      if (ctx.state === 'suspended') await ctx.resume()
    },
    resume() {
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    },
    stop() {
      if (motifTimer) clearInterval(motifTimer)
      if (heartTimer) clearInterval(heartTimer)
      motifTimer = heartTimer = null
      for (const o of drone) {
        try {
          o.stop()
        } catch {}
      }
      try {
        windNode?.stop()
      } catch {}
      try {
        void ctx?.close()
      } catch {}
      ctx = null
    },
    setMuted(m: boolean) {
      muted = m
      if (master && ctx) master.gain.linearRampToValueAtTime(m ? 0 : 0.9, ctx.currentTime + 0.2)
    },
    isMuted: () => muted,
    setMusic(on: boolean) {
      musicOn = on
      if (droneGain && ctx) {
        const target = on ? (mode === 'off' ? 0 : mode === 'lobby' ? 0.5 : mode === 'tension' ? 0.75 : mode === 'final' ? 1 : 0.55) : 0
        droneGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3)
      }
    },
    setMode,
    sfx,
    ghostWail,
    victory,
    voice,
  }
}
