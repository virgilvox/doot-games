/**
 * Tiny client-only sound effects synthesized with the Web Audio API - no assets,
 * SSR-guarded, and a clean no-op where audio is unavailable or blocked. Used for
 * the gameshow "you buzzed in first!" ding. Audio only plays after a user
 * gesture (the player has tapped to answer by the time the ding fires).
 */

type AudioCtor = typeof AudioContext

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  return (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) ?? null
}

/** A bright two-note chime (the "you got it / buzzed in" ding). */
export function playDing(): void {
  const Ctor = audioCtor()
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const t0 = ctx.currentTime
    // A5 then E6 - a quick rising "ta-da".
    ;[880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const start = t0 + i * 0.11
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4)
      osc.start(start)
      osc.stop(start + 0.45)
    })
    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 1200)
  } catch {
    /* audio blocked / unavailable: silent */
  }
}
