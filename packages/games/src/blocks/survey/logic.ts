/**
 * Pure Survey (Family Feud) scoring. A round has a hidden BOARD of ranked answers,
 * each worth some points. Each player submits a few guesses; for every DISTINCT
 * board answer any of their guesses matches, they earn its points. Matching uses
 * the shared P1 tolerant matcher (fold + small typo), so "ice cream" finds
 * "Ice Cream". Pure + deterministic; the block's aggregate/reveal call this.
 */
import { matchAnswer } from '../text-match'

export interface SurveyAnswer {
  text: string
  points: number
}
export interface SurveyContent {
  prompt: string
  answers: SurveyAnswer[]
  guessCount: number
  timer: number | null
}
export interface SurveyInput {
  guesses: string[]
}

/**
 * Score one survey round against `board`. Returns each player's points (sum of the
 * distinct board answers they found) and, per board answer, how many players found
 * it (for the "survey says" reveal). A guess matches the highest-ranked board answer
 * it fits; a player never double-counts the same answer.
 */
export function scoreSurvey(
  board: SurveyAnswer[],
  inputs: Map<string, SurveyInput>,
): { scores: Map<string, number>; hits: number[] } {
  const scores = new Map<string, number>()
  const hits = board.map(() => 0)
  for (const [pid, input] of inputs) {
    const matched = new Set<number>()
    for (const guess of input?.guesses ?? []) {
      const g = (guess ?? '').trim()
      if (!g) continue
      const idx = board.findIndex((a) => matchAnswer(g, [a.text], { fuzzy: true }))
      if (idx >= 0) matched.add(idx)
    }
    let pts = 0
    for (const i of matched) {
      pts += board[i]?.points ?? 0
      hits[i] = (hits[i] ?? 0) + 1
    }
    if (pts > 0) scores.set(pid, pts)
  }
  return { scores, hits }
}

/**
 * Parse a board from a deck string like "Pepperoni:35 | Cheese:25 | Mushroom".
 * An explicit `:points` wins; a bare entry gets rank-based points (first = highest),
 * so a creator can list answers without scoring them. Returns [] for empty input.
 */
export function parseBoard(raw: string): SurveyAnswer[] {
  const segments = raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  return segments
    .map((seg, i) => {
      const c = seg.lastIndexOf(':')
      const hasPts = c > 0 && /^\d+$/.test(seg.slice(c + 1).trim())
      const text = (hasPts ? seg.slice(0, c) : seg).trim()
      const points = hasPts ? Number(seg.slice(c + 1).trim()) : (segments.length - i) * 5
      return { text, points }
    })
    .filter((a) => a.text)
}
