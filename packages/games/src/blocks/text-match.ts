/**
 * Free-text answer matching, the shared primitive (expansion plan P1). Pure and
 * game-agnostic: turn a free-text submission into a tolerant yes/no against a list
 * of accepted answers, so a typed-answer trivia round forgives case, spacing,
 * punctuation, accents, a leading article, and a small typo, while a synonym list
 * lets one question accept several phrasings ("NYC" / "New York City").
 *
 * `normalizeAnswer` is the aggressive fold lifted out of the hivemind block (which
 * now re-exports it, so its existing tests lock the behavior). NOTE: this is NOT
 * `fibvote`'s gentler `norm` (which keeps articles + internal punctuation to test a
 * lie for equality against an exact truth) nor `faker`'s one-word `normalizeClue`;
 * both of those stay as they are on purpose.
 */

/** Normalize an answer for matching: lowercase, trim, collapse whitespace, drop a
 *  leading article, fold every non-alphanumeric to a space. Pure. Kept byte-identical
 *  to the original hivemind implementation (its tests are the regression lock). */
export function normalizeAnswer(raw: string): string {
  let s = (raw ?? '').toLowerCase().trim()
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/u, '')
  return s
}

/** Strip diacritics so "Beyoncé" matches "Beyonce" and "Pelé" matches "Pele". Pure. */
export function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** The full matching key: diacritics-folded, then normalized. Empty when the input
 *  has no alphanumeric content. Pure. */
export function matchKey(raw: string): string {
  return normalizeAnswer(foldDiacritics(raw ?? ''))
}

/**
 * Levenshtein edit distance, bounded: returns the true distance, or `max + 1` once
 * it is certain the distance exceeds `max` (so callers that only care about a small
 * tolerance never pay for a far-apart pair). Pure.
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  let prev = Array.from({ length: bl + 1 }, (_, i) => i)
  let cur = new Array<number>(bl + 1)
  for (let i = 1; i <= al; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
      if (cur[j]! < rowMin) rowMin = cur[j]!
    }
    // Whole remaining rows can only grow this row's minimum, so bail early.
    if (rowMin > max) return max + 1
    ;[prev, cur] = [cur, prev]
  }
  return prev[bl]!
}

/** How many typos to forgive for a key of length `len` when fuzzy matching is on:
 *  none for very short answers (so "cat" never matches "bat"), one for medium, two
 *  for long. Conservative on purpose; a block can override via `maxEdits`. */
export function autoMaxEdits(len: number): number {
  if (len <= 3) return 0
  if (len <= 7) return 1
  return 2
}

export interface MatchOptions {
  /** Forgive a small typo via bounded edit distance (default true). */
  fuzzy?: boolean
  /** Override the per-length typo budget (default `autoMaxEdits`). */
  maxEdits?: number
}

/**
 * Whether `guess` matches any of the `accepted` answers (the synonym list). Folds
 * accents + normalizes both sides; an exact normalized match always counts, and with
 * `fuzzy` on a small edit distance is forgiven (budget scales with answer length).
 * Returns false for an empty guess or an empty accepted list. Pure.
 */
export function matchAnswer(guess: string, accepted: string[], opts: MatchOptions = {}): boolean {
  const gk = matchKey(guess)
  if (!gk) return false
  const fuzzy = opts.fuzzy ?? true
  for (const a of accepted) {
    const ak = matchKey(a)
    if (!ak) continue
    if (gk === ak) return true
    if (fuzzy) {
      const budget = opts.maxEdits ?? autoMaxEdits(ak.length)
      if (budget > 0 && editDistance(gk, ak, budget) <= budget) return true
    }
  }
  return false
}
