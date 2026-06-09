/**
 * Pure Wavelength scoring (the clue-giver dial). One player (the clue-giver) is shown
 * a hidden TARGET on a 0-100 spectrum and writes a clue; everyone else guesses where
 * the target is. Guessers score by closeness to the target; the clue-giver scores by
 * how close the guessers landed on average (a good clue lands the whole room).
 *
 * Closeness reuses ballpark's P6 scorer against a FIXED half-scale (50), like the
 * consensus Spectrum, so it is fair at any group size. Pure + deterministic.
 */
import { ballparkCloseness } from '../ballpark/block'
import { BASE_POINTS } from '../scoring'

/** Half the 0-100 scale: a guess this far from the target scores nothing. */
export const SCALE_HALF = 50

export interface WavelengthMark {
  pid: string
  value: number
  closeness: number
  points: number
}

/**
 * Score one guess round. `guesses` is each GUESSER's value (the caller excludes the
 * clue-giver). Returns each guesser's points, the clue-giver's points (the average
 * guesser closeness, so a clue that lands everyone is worth full points), and the
 * marks for the reveal.
 */
export function scoreWavelength(
  target: number,
  guesses: Map<string, number>,
): { perGuesser: Map<string, number>; clueGiverPoints: number; marks: WavelengthMark[] } {
  const t = Math.max(0, Math.min(100, target))
  const marks: WavelengthMark[] = []
  const perGuesser = new Map<string, number>()
  let sumCloseness = 0
  for (const [pid, raw] of guesses) {
    const value = Math.max(0, Math.min(100, raw))
    const closeness = ballparkCloseness(Math.abs(value - t), SCALE_HALF)
    const points = Math.round(BASE_POINTS * closeness)
    perGuesser.set(pid, points)
    sumCloseness += closeness
    marks.push({ pid, value, closeness, points })
  }
  const clueGiverPoints = marks.length ? Math.round(BASE_POINTS * (sumCloseness / marks.length)) : 0
  return { perGuesser, clueGiverPoints, marks }
}
