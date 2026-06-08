/**
 * Pure Spectrum scoring (the consensus dial). Everyone places the subject on a
 * 0-100 dial between two poles; you score by how close you land to the room's
 * CONSENSUS (the mean of all placements). "Read the room", on a continuous scale.
 *
 * Closeness reuses ballpark's P6 scorer, but against a FIXED half-scale (50) rather
 * than the round's worst error: a field-relative curve degenerates for 2-3 players
 * (everyone is equidistant from the mean -> everyone scores 0), whereas an absolute
 * curve gives a fair gradient at any group size. Pure + deterministic.
 */
import { ballparkCloseness } from '../ballpark/block'
import { BASE_POINTS } from '../scoring'

export interface SpectrumContent {
  prompt: string
  leftLabel: string
  rightLabel: string
  timer: number | null
}
export interface SpectrumInput {
  value: number | null
}

/** Half the 0-100 scale: a placement this far from the consensus scores nothing.
 *  Exported so the phone reveal scores a player's own mark with the same curve. */
export const SCALE_HALF = 50

export function scoreSpectrum(inputs: Map<string, SpectrumInput>): {
  scores: Map<string, number>
  mean: number | null
  marks: Array<{ pid: string; value: number }>
} {
  const marks: Array<{ pid: string; value: number }> = []
  for (const [pid, input] of inputs) {
    const v = input?.value
    if (typeof v === 'number' && Number.isFinite(v)) marks.push({ pid, value: Math.max(0, Math.min(100, v)) })
  }
  if (marks.length === 0) return { scores: new Map(), mean: null, marks }
  const mean = marks.reduce((s, m) => s + m.value, 0) / marks.length
  const scores = new Map<string, number>()
  for (const m of marks) {
    const pts = Math.round(BASE_POINTS * ballparkCloseness(Math.abs(m.value - mean), SCALE_HALF))
    scores.set(m.pid, pts)
  }
  return { scores, mean, marks }
}
