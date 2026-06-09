/**
 * Stage SFX: small synthesized sounds for the generic big-screen host, so every
 * composed game gets stage feedback without per-game audio code: a pop when a
 * player joins the lobby, a click as answers lock in, a chime when EVERYONE is
 * in, countdown ticks over the last five seconds, a reveal sting, and a results
 * fanfare. All Web Audio (no assets, casts with the tab, identical on every
 * machine), SSR-safe, and silent until `arm()` runs inside a user gesture
 * (browsers keep an AudioContext suspended until then). The host screen is the
 * room's speaker; phones never play these.
 */

export interface StageSfx {
  /** Unlock/resume the context. Call from a user gesture (lobby tap, Start). */
  arm(): void
  setMuted(m: boolean): void
  /** A player joined the lobby. */
  join(): void
  /** An answer arrived ("locked in"). */
  lockIn(): void
  /** Every eligible player is in. */
  allIn(): void
  /** Countdown tick (last seconds). */
  tick(): void
  /** The timer hit zero. */
  timeUp(): void
  /** The reveal beat. */
  reveal(): void
  /** Final results. */
  fanfare(): void
  dispose(): void
}

export function createStageSfx(): StageSfx {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false

  function ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    if (!ctx) {
      try {
        ctx = new AC()
        master = ctx.createGain()
        master.gain.value = muted ? 0 : 0.5
        master.connect(ctx.destination)
      } catch {
        return null
      }
    }
    return ctx
  }

  /** One enveloped note. `when` is seconds from now. */
  function note(
    freq: number,
    opts: { when?: number; dur?: number; type?: OscillatorType; gain?: number; glideTo?: number } = {},
  ): void {
    if (muted) return
    const c = ensure()
    if (!c || !master || c.state !== 'running') return
    try {
      const t = c.currentTime + (opts.when ?? 0)
      const dur = opts.dur ?? 0.09
      const osc = c.createOscillator()
      osc.type = opts.type ?? 'sine'
      osc.frequency.setValueAtTime(freq, t)
      if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur)
      const env = c.createGain()
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + 0.012)
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(env)
      env.connect(master)
      osc.start(t)
      osc.stop(t + dur + 0.03)
    } catch {
      /* never let a sound break the show */
    }
  }

  return {
    arm() {
      const c = ensure()
      void c?.resume().catch(() => {})
    },
    setMuted(m: boolean) {
      muted = m
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05)
    },
    join() {
      note(440, { glideTo: 660, dur: 0.1, gain: 0.22 })
    },
    lockIn() {
      note(880, { type: 'triangle', dur: 0.05, gain: 0.16 })
    },
    allIn() {
      note(659, { dur: 0.12, gain: 0.26 })
      note(880, { when: 0.1, dur: 0.18, gain: 0.26 })
    },
    tick() {
      note(1180, { type: 'square', dur: 0.035, gain: 0.1 })
    },
    timeUp() {
      note(660, { type: 'sawtooth', glideTo: 320, dur: 0.28, gain: 0.2 })
    },
    reveal() {
      note(523, { dur: 0.09, gain: 0.22 })
      note(659, { when: 0.07, dur: 0.09, gain: 0.22 })
      note(784, { when: 0.14, dur: 0.16, gain: 0.24 })
    },
    fanfare() {
      note(523, { dur: 0.14, gain: 0.24 })
      note(659, { when: 0.1, dur: 0.14, gain: 0.24 })
      note(784, { when: 0.2, dur: 0.16, gain: 0.24 })
      note(1047, { when: 0.3, dur: 0.34, gain: 0.26 })
      note(784, { when: 0.3, dur: 0.34, gain: 0.14 })
      note(659, { when: 0.3, dur: 0.34, gain: 0.12 })
    },
    dispose() {
      try {
        void ctx?.close()
      } catch {
        /* ignore */
      }
      ctx = null
      master = null
    },
  }
}
