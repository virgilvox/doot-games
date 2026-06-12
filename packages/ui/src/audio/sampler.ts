/**
 * A tiny, reusable sample + music player over Web Audio. Decode a set of named
 * URLs once, then fire one-shots or loop a track through a caller-provided
 * destination (so it shares the game's master gain and casts with the tab, the
 * same cast-safe path the synth SFX use). Any game can use this; Pit Party drives
 * its engine/menu/podium music and the licensed car/arcade SFX through it.
 *
 * SSR-safe by construction: it is only ever constructed from a live AudioContext.
 */

export interface Sampler {
  /** Decode a map of name -> URL. Safe to call repeatedly (skips already-loaded). */
  load(urls: Record<string, string>): Promise<void>
  /** Whether a sample finished decoding. */
  has(name: string): boolean
  /** Play a one-shot. Returns a stop handle. */
  play(name: string, vol?: number, rate?: number): () => void
  /** Loop a sample (e.g. music). Re-looping the same name restarts it. */
  loop(name: string, vol?: number): void
  /** Stop a looping sample by name. */
  stop(name: string): void
  /** Stop every looping sample. */
  stopAll(): void
  /** Fade a looping sample's volume (seconds). */
  fade(name: string, vol: number, seconds?: number): void
}

export function createSampler(ctx: AudioContext, destination: AudioNode): Sampler {
  const buffers = new Map<string, AudioBuffer>()
  const loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>()

  async function decode(url: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(url)
      const arr = await res.arrayBuffer()
      return await ctx.decodeAudioData(arr)
    } catch {
      return null
    }
  }

  return {
    async load(urls) {
      await Promise.all(
        Object.entries(urls).map(async ([name, url]) => {
          if (buffers.has(name)) return
          const buf = await decode(url)
          if (buf) buffers.set(name, buf)
        }),
      )
    },
    has(name) {
      return buffers.has(name)
    },
    play(name, vol = 1, rate = 1) {
      const buf = buffers.get(name)
      if (!buf) return () => {}
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = rate
      const g = ctx.createGain()
      g.gain.value = vol
      src.connect(g)
      g.connect(destination)
      src.start()
      return () => {
        try {
          src.stop()
        } catch {
          /* already stopped */
        }
      }
    },
    loop(name, vol = 1) {
      const buf = buffers.get(name)
      if (!buf) return
      this.stop(name)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const g = ctx.createGain()
      g.gain.value = vol
      src.connect(g)
      g.connect(destination)
      src.start()
      loops.set(name, { src, gain: g })
    },
    stop(name) {
      const l = loops.get(name)
      if (!l) return
      try {
        l.src.stop()
      } catch {
        /* already stopped */
      }
      loops.delete(name)
    },
    stopAll() {
      for (const name of [...loops.keys()]) this.stop(name)
    },
    fade(name, vol, seconds = 0.6) {
      const l = loops.get(name)
      if (!l) return
      const now = ctx.currentTime
      l.gain.gain.cancelScheduledValues(now)
      l.gain.gain.setValueAtTime(l.gain.gain.value, now)
      l.gain.gain.linearRampToValueAtTime(vol, now + seconds)
    },
  }
}
