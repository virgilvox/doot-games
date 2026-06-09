/**
 * Read-time scaling for judge galleries. A vote round's options are derived at
 * runtime from the room's own submissions, so the gallery a 3-player room votes
 * on is small while an 8-player room of mad-libs stories is a wall of text; a
 * fixed 30s window punishes the bigger room (nobody finishes reading before the
 * auto-lock). The blocks scale their `timerOf` with the derived content, and the
 * engine consults that via `LoadedGame.timerFor`, so the deadline, the countdown
 * ring, and the phones all agree. Pure and unit-tested.
 */

export interface ReadLoad {
  /** Option/scenario texts the room has to read before it can vote. */
  texts?: Array<string | undefined>
  /** Drawings/photos the room has to look at before it can vote. */
  images?: number
}

/**
 * Stretch a base vote timer to cover reading the gallery. Untimed (null) stays
 * untimed and an explicit 0 still auto-locks; only a positive base grows:
 *  - text beyond what the base already budgets (~2 short answers, 80 chars)
 *    adds at a party-room reading pace of ~15 chars/sec,
 *  - images beyond the first 4 add a 2s glance each,
 *  - the stretch is capped at +45s so a giant room can't stall the night.
 */
export function scaleReadTimer(base: number | null | undefined, load: ReadLoad): number | null {
  if (base == null) return null
  if (base <= 0) return base
  const chars = (load.texts ?? []).reduce((n, t) => n + (t?.length ?? 0), 0)
  const readSec = Math.max(0, Math.ceil((chars - 80) / 15))
  const imgSec = Math.max(0, (load.images ?? 0) - 4) * 2
  return base + Math.min(45, readSec + imgSec)
}
