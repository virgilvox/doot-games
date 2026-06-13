/**
 * Pit Party audio. The per-kart engine drone, ambient bed, and one-shot SFX are
 * synthesized in Web Audio (so they travel with a tab cast, unlike speechSynthesis),
 * ported from the KERF prototype. Sample-based music + extra SFX (the licensed car /
 * racing / arcade assets) load through the reusable `@doot-games/ui` Sampler and
 * play through the same master gain. SSR-safe: every method no-ops with no context.
 */
import { createSampler, type Sampler } from '@doot-games/ui'
import type { Kart, RaceEvent } from '../sim/types'

interface EngineNodes {
  o1: OscillatorNode
  o2: OscillatorNode
  sub: OscillatorNode
  f: BiquadFilterNode
  g: GainNode
  sk: AudioBufferSourceNode
  skf: BiquadFilterNode
  skg: GainNode
}

const BASE_TOP = 34

export class PitAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private engines = new Map<string, EngineNodes>()
  private ambId = 'kiln'
  private ambNodes: AudioNode[] = []
  private muted = false
  sampler: Sampler | null = null

  private ensure(): boolean {
    if (this.ctx) return true
    if (typeof window === 'undefined') return false
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return false
    try {
      this.ctx = new AC()
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.knee.value = 22
      comp.ratio.value = 5
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.5
      this.master.connect(comp)
      comp.connect(this.ctx.destination)
      const len = this.ctx.sampleRate
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      this.sampler = createSampler(this.ctx, this.master)
    } catch {
      this.ctx = null
    }
    return !!this.ctx
  }

  /** Call from a user gesture to unlock + start the ambient bed. */
  arm(): void {
    if (!this.ensure()) return
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
    if (this.ambNodes.length === 0) this.startAmbient()
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.5
  }

  private streamDest: MediaStreamAudioDestinationNode | null = null

  /** A MediaStream of everything routed through the master (music + SFX + engines),
   *  for the spectator WebRTC stream. The cast-safe Web Audio path. */
  getAudioStream(): MediaStream | null {
    if (!this.ensure() || !this.ctx || !this.master) return null
    if (!this.streamDest) {
      this.streamDest = this.ctx.createMediaStreamDestination()
      this.master.connect(this.streamDest)
    }
    return this.streamDest.stream
  }

  // synthesized one-shots
  private beep(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, bend = 0): void {
    if (!this.ensure() || !this.ctx || !this.master) return
    const t = this.ctx.currentTime + when
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + bend), t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  private sweep(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ensure() || !this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private hiss(dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = 0): void {
    if (!this.ensure() || !this.ctx || !this.master || !this.noise) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(f0, t)
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  readonly sfx = {
    count: () => this.beep(440, 0.16, 'square', 0.22),
    go: () => {
      if (this.sample('go', 0.6)) return
      this.beep(523, 0.42, 'square', 0.16)
      this.beep(659, 0.42, 'square', 0.16)
      this.beep(784, 0.42, 'square', 0.16)
      this.hiss(0.18, 0.12, 'highpass', 5000)
    },
    pick: () => {
      this.beep(620, 0.06, 'square', 0.16)
      this.beep(930, 0.07, 'square', 0.16, 0.06)
      this.beep(1245, 0.12, 'triangle', 0.2, 0.12)
    },
    boost: () => {
      this.sweep(160, 940, 0.5, 'sawtooth', 0.16)
      this.hiss(0.5, 0.18, 'bandpass', 500, 3200)
    },
    hit: () => {
      this.hiss(0.22, 0.3, 'lowpass', 2200, 300)
      this.sweep(420, 70, 0.42, 'sawtooth', 0.24)
    },
    zap: () => {
      for (let i = 0; i < 6; i++) this.beep(1500 - i * 170, 0.05, 'sawtooth', 0.13, i * 0.045, -300)
      this.hiss(0.3, 0.12, 'highpass', 3400)
    },
    lap: () => {
      this.beep(740, 0.1, 'square', 0.2)
      this.beep(988, 0.16, 'square', 0.2, 0.1)
    },
    finalLap: () => {
      this.beep(740, 0.09, 'square', 0.2)
      this.beep(880, 0.09, 'square', 0.2, 0.09)
      this.beep(1175, 0.2, 'square', 0.22, 0.18)
    },
    throwIt: () => {
      this.hiss(0.2, 0.2, 'bandpass', 900, 2600)
      this.sweep(280, 640, 0.16, 'square', 0.1)
    },
    bump: () => {
      this.sweep(130, 55, 0.16, 'sine', 0.3)
      this.hiss(0.07, 0.12, 'lowpass', 900)
    },
    scrape: () => this.hiss(0.16, 0.16, 'bandpass', 1700, 900),
    fall: () => {
      this.sweep(620, 70, 0.9, 'sawtooth', 0.16)
      this.hiss(0.9, 0.12, 'bandpass', 700, 250)
    },
    respawn: () => {
      this.beep(330, 0.07, 'square', 0.14)
      this.beep(660, 0.12, 'triangle', 0.18, 0.07)
    },
    finish: (place = 9) => {
      if (place <= 3 && this.sample('win', 0.6)) return
      if (place <= 3) {
        ;[523, 659, 784, 1046, 1318].forEach((f, i) => this.beep(f, 0.2, 'square', 0.18, i * 0.11))
      } else {
        this.beep(392, 0.18, 'square', 0.18)
        this.beep(494, 0.3, 'square', 0.16, 0.16)
      }
    },
  }

  /** Translate a drained sim event into a sound (host calls this per event). */
  onEvent(e: RaceEvent, place?: number): void {
    switch (e.kind) {
      case 'pick':
        return this.sfx.pick()
      case 'boost':
        return this.sfx.boost()
      case 'hit':
        if (this.sample('crash', 0.45)) return
        return this.sfx.hit()
      case 'bump':
        return this.sfx.bump()
      case 'wall':
        return this.sfx.scrape()
      case 'zap':
        return this.sfx.zap()
      case 'throw':
        return this.sfx.throwIt()
      case 'fall':
        return this.sfx.fall()
      case 'respawn':
        return this.sfx.respawn()
      case 'lap':
        return this.sfx.lap()
      case 'finalLap':
        return this.sfx.finalLap()
      case 'finish':
        return this.sfx.finish(place ?? e.place ?? 9)
    }
  }

  // per-kart engine drone
  engineFor(id: string): void {
    if (!this.ensure() || !this.ctx || !this.master || !this.noise) return
    if (this.engines.has(id)) return
    const c = this.ctx
    const o1 = c.createOscillator()
    const o2 = c.createOscillator()
    const sub = c.createOscillator()
    o1.type = 'sawtooth'
    o2.type = 'square'
    sub.type = 'triangle'
    o1.frequency.value = 50
    o2.frequency.value = 78
    sub.frequency.value = 25
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 420
    f.Q.value = 0.8
    const g = c.createGain()
    g.gain.value = 0
    const o2g = c.createGain()
    o2g.gain.value = 0.5
    const subg = c.createGain()
    subg.gain.value = 0.7
    o1.connect(f)
    o2.connect(o2g)
    o2g.connect(f)
    sub.connect(subg)
    subg.connect(f)
    f.connect(g)
    g.connect(this.master)
    o1.start()
    o2.start()
    sub.start()
    const sk = c.createBufferSource()
    sk.buffer = this.noise
    sk.loop = true
    const skf = c.createBiquadFilter()
    skf.type = 'bandpass'
    skf.frequency.value = 1100
    skf.Q.value = 1.6
    const skg = c.createGain()
    skg.gain.value = 0
    sk.connect(skf)
    skf.connect(skg)
    skg.connect(this.master)
    sk.start()
    this.engines.set(id, { o1, o2, sub, f, g, sk, skf, skg })
  }

  engineUpdate(id: string, k: Kart, running: boolean): void {
    const e = this.engines.get(id)
    if (!e || !this.ctx) return
    const sp = Math.abs(k.speed)
    const t = this.ctx.currentTime
    // duck each drone as more karts run so 4-way split-screen doesn't drown the music
    const crowd = Math.max(0.55, 1 - (this.engines.size - 1) * 0.13)
    const target = running && !k.falling ? (0.026 + (sp / BASE_TOP) * 0.055) * crowd : 0
    e.g.gain.setTargetAtTime(target, t, 0.08)
    const f0 = 44 + sp * 4 + (k.boostT > 0 ? 64 : 0)
    e.o1.frequency.setTargetAtTime(f0, t, 0.05)
    e.o2.frequency.setTargetAtTime(f0 * 1.5 + 3, t, 0.05)
    e.sub.frequency.setTargetAtTime(f0 * 0.5, t, 0.06)
    e.f.frequency.setTargetAtTime(280 + sp * 26 + (k.boostT > 0 ? 500 : 0), t, 0.08)
    const skT = k.drifting && sp > 8 ? 0.04 + k.driftTier * 0.018 : k.offroad && sp > 10 ? 0.018 : 0
    e.skg.gain.setTargetAtTime(skT, t, 0.06)
    e.skf.frequency.setTargetAtTime(900 + k.driftCharge * 420 + sp * 8, t, 0.1)
  }

  engineDrop(id: string): void {
    const e = this.engines.get(id)
    if (!e) return
    try {
      e.g.gain.value = 0
      e.skg.gain.value = 0
      e.o1.stop()
      e.o2.stop()
      e.sub.stop()
      e.sk.stop()
    } catch {
      /* already stopped */
    }
    this.engines.delete(id)
  }

  // ambient bed
  ambient(id: string): void {
    this.ambId = id
    if (this.ctx && this.ctx.state !== 'closed') this.startAmbient()
  }

  private stopAmbient(): void {
    for (const n of this.ambNodes) {
      try {
        ;(n as AudioBufferSourceNode | OscillatorNode).stop?.()
      } catch {
        /* not a source */
      }
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.ambNodes = []
  }

  private startAmbient(): void {
    if (!this.ensure() || !this.ctx || !this.master || !this.noise) return
    this.stopAmbient()
    const c = this.ctx
    const t = c.currentTime
    const g = c.createGain()
    g.gain.value = 0
    g.connect(this.master)
    this.ambNodes.push(g)
    g.gain.setTargetAtTime(1, t, 1.2)
    const n = c.createBufferSource()
    n.buffer = this.noise
    n.loop = true
    const nf = c.createBiquadFilter()
    nf.type = this.ambId === 'prism' ? 'highpass' : 'lowpass'
    nf.frequency.value = this.ambId === 'prism' ? 6200 : 320
    const ng = c.createGain()
    ng.gain.value = this.ambId === 'prism' ? 0.005 : 0.02
    n.connect(nf)
    nf.connect(ng)
    ng.connect(g)
    n.start()
    this.ambNodes.push(n)
  }

  // licensed music + marquee one-shots (loaded once, played via the sampler)
  private base = '/pit-party/audio'

  /** Decode the music loops + marquee SFX. Safe to call repeatedly. */
  async loadAssets(): Promise<void> {
    if (!this.ensure() || !this.sampler) return
    await this.sampler.load({
      menu: `${this.base}/music_menu.mp3`,
      race: `${this.base}/music_race.mp3`,
      race2: `${this.base}/music_race2.mp3`,
      podium: `${this.base}/music_podium.mp3`,
      go: `${this.base}/sfx_go.mp3`,
      win: `${this.base}/sfx_win.mp3`,
      crash: `${this.base}/sfx_crash.mp3`,
    })
  }

  /** Loop a music track (menu / race / race2 / podium). No-op until loaded. */
  playMusic(name: 'menu' | 'race' | 'race2' | 'podium', vol = 0.32): void {
    this.sampler?.stopAll()
    this.sampler?.loop(name, vol)
  }

  stopMusic(): void {
    this.sampler?.stopAll()
  }

  private sample(name: string, vol: number): boolean {
    if (this.sampler?.has(name)) {
      this.sampler.play(name, vol)
      return true
    }
    return false
  }

  dispose(): void {
    this.stopAmbient()
    for (const id of [...this.engines.keys()]) this.engineDrop(id)
    this.sampler?.stopAll()
    try {
      void this.ctx?.close()
    } catch {
      /* ignore */
    }
    this.ctx = null
  }
}
