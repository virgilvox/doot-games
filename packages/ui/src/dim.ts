/**
 * Screen dimming for the phone surface.
 *
 * The HOST picks the theme and every phone in the room adopts it, which is right
 * for the big screen and wrong for the person holding the phone: five of the six
 * theme packs are light, and a light phone at full brightness in a dark venue is
 * genuinely unpleasant to hold for an hour. Rather than fight the host's theme
 * (a per-player dark mode would have to re-derive every token and would break the
 * theme's identity), this dims the whole surface with an overlay, which works
 * with any theme and costs one element.
 *
 * Pure + storage-safe so it can be tested and so it survives a play surface where
 * storage is blocked entirely (embedded frames, private windows), which the PRD
 * requires the phone client to tolerate.
 */

export const DIM_LEVELS = [0, 0.25, 0.45, 0.65] as const
export type DimLevel = (typeof DIM_LEVELS)[number]

const KEY = 'doot:dim'

/** The next level in the cycle, wrapping back to full brightness. */
export function nextDim(level: number): DimLevel {
  const i = DIM_LEVELS.indexOf(clampDim(level))
  return DIM_LEVELS[(i + 1) % DIM_LEVELS.length] as DimLevel
}

/** Snap any number to the nearest supported level (0 when it is not a number). */
export function clampDim(level: unknown): DimLevel {
  const n = typeof level === 'number' && Number.isFinite(level) ? level : 0
  let best: DimLevel = DIM_LEVELS[0]
  for (const l of DIM_LEVELS) if (Math.abs(l - n) < Math.abs(best - n)) best = l
  return best
}

/** A short label for the current level, for the button and its accessible name. */
export function dimLabel(level: number): string {
  const i = DIM_LEVELS.indexOf(clampDim(level))
  return ['Bright', 'Dim', 'Dimmer', 'Darkest'][i] ?? 'Bright'
}

/**
 * The player's last choice. Every access is wrapped: on a play surface where
 * storage throws on ACCESS (not just on read), an unguarded read takes the whole
 * phone client down, so this always falls back to full brightness.
 */
export function loadDim(): DimLevel {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    return raw == null ? 0 : clampDim(Number(raw))
  } catch {
    return 0
  }
}

export function saveDim(level: number): void {
  try {
    globalThis.localStorage?.setItem(KEY, String(clampDim(level)))
  } catch {
    /* storage blocked: the choice just doesn't outlive the page */
  }
}
