/**
 * Pure Scattergories scoring. Each round shows a letter and several categories;
 * players type an answer per category. An answer scores 1 only if it is VALID
 * (starts with the letter) AND UNIQUE (no other player gave the same answer in that
 * category) - the Scattergories rule that rewards thinking differently. Uniqueness
 * uses the shared `normalizeAnswer` fold, so "Cat"/"cat"/"a cat" collide. Pure +
 * deterministic; the block's aggregate/reveal call this.
 */
import { normalizeAnswer } from '../text-match'

export interface CategoriesContent {
  prompt: string
  letter: string
  categories: Array<{ id: string; label: string }>
  timer: number | null
}
export interface CategoriesInput {
  /** category id -> the player's typed answer. */
  answers: Record<string, string>
}

/** Whether `answer` is a valid play for `letter`: non-empty and, ignoring a leading
 *  article + case (the same fold uniqueness uses), starting with the letter. So
 *  "The Otter" counts for O, and "a Apple" counts for A. Pure. */
export function startsWithLetter(answer: string, letter: string): boolean {
  const norm = normalizeAnswer(answer)
  const l = letter.trim().toLowerCase()
  return !!norm && !!l && norm.startsWith(l)
}

/** One category's answers + how they scored, for the reveal. */
export interface CategoryBreakdown {
  id: string
  label: string
  entries: Array<{ pid: string; text: string; valid: boolean; unique: boolean; scored: boolean }>
}

/**
 * Score one categories round: per-player totals (1 per valid + unique answer) and a
 * per-category breakdown (every answer, flagged valid/unique/scored) for the reveal.
 * Only counts players present in `inputs` (the engine already gates ineligible
 * submits), so eligibility is applied by the caller when folding into the board.
 */
export function scoreCategories(
  content: CategoriesContent,
  inputs: Map<string, CategoriesInput>,
): { scores: Map<string, number>; breakdown: CategoryBreakdown[] } {
  const scores = new Map<string, number>()
  const breakdown: CategoryBreakdown[] = []
  for (const cat of content.categories) {
    const rows = [...inputs.entries()].map(([pid, input]) => {
      const text = (input?.answers?.[cat.id] ?? '').trim()
      const valid = startsWithLetter(text, content.letter)
      return { pid, text, valid, key: valid ? normalizeAnswer(text) : '' }
    })
    // Count valid answers by their normalized key, for the uniqueness test.
    const counts = new Map<string, number>()
    for (const r of rows) if (r.valid) counts.set(r.key, (counts.get(r.key) ?? 0) + 1)
    const entries = rows
      .filter((r) => r.text) // only surface players who actually wrote something
      .map((r) => {
        const unique = r.valid && (counts.get(r.key) ?? 0) === 1
        const scored = r.valid && unique
        if (scored) scores.set(r.pid, (scores.get(r.pid) ?? 0) + 1)
        return { pid: r.pid, text: r.text, valid: r.valid, unique, scored }
      })
      .sort((a, b) => Number(b.scored) - Number(a.scored) || a.text.localeCompare(b.text))
    breakdown.push({ id: cat.id, label: cat.label, entries })
  }
  return { scores, breakdown }
}
