/**
 * How the results board splits itself into pages, and how a podium reads.
 *
 * Pulled out of `GameResults.vue` because it is real logic, not markup: it
 * branches, it slices, and it does index arithmetic that has already been wrong
 * once (a chunked podium restarted its numbering at #1 on every page, which only
 * showed up by reading the rendered DOM). The component has no test setup, so
 * rules that can be wrong live here where they can be.
 */
import type { StandardResults } from '@doot-games/sdk'

export type Distribution = NonNullable<StandardResults['distributions']>[number]

export type Slide =
  | { kind: 'teams'; label: string }
  | { kind: 'leaderboard'; label: string }
  | { kind: 'awards'; label: string }
  | { kind: 'dist'; label: string; dist: Distribution; crown: boolean }

/**
 * A podium taller than this does not fit the host frame, so it is PAGED rather
 * than clipped. Six is the hero card plus the five rows that fit beside it at
 * 1280x720, measured in `/dev/results` rather than guessed; the phone stacks and
 * scrolls, so only the big screen is constrained by it.
 */
export const PODIUM_PER_PAGE = 6

/** A distribution whose bars ARE an ordering (rank, a combined rating) asks for
 *  the podium layout: the winner large, the rest of the order listed under it. */
export const isPodium = (d: Distribution) => d.layout === 'podium'

/** A round nobody answered still contributes its breakdown, so a bar list can be
 *  empty. Say so rather than drawing a titled, empty box. */
export const hasBars = (d: Distribution) => d.bars.length > 0

/** An author may clear a prompt, and a block titles its breakdown with that
 *  prompt, so the title can be an empty string (`?? 'Breakdown'` only catches
 *  undefined). */
export const distTitle = (d: Distribution) => d.title?.trim() || 'Breakdown'

/** A podium whose top place is SHARED has no single winner to hero: the first bar
 *  is just whichever tied entry sorted first, so crowning it would invent a result. */
export function podiumHasWinner(d: Distribution): boolean {
  const [first, second] = d.bars
  if (!first) return false
  return !second || (first.place ?? '') !== (second.place ?? '')
}

/**
 * One slide per distribution, EXCEPT a long podium, which becomes several.
 *
 * A section that does not fit is the one thing this board must never produce:
 * the host frame is fixed and it pages, it does not scroll a TV. A 14-subject
 * rating ranking (a whole night of "rate this") rendered its hero, six rows, and
 * then a seventh sliced through the middle, with the remaining seven subjects
 * gone and no page to reach them.
 *
 * Only the FIRST page crowns: the winner is the top of the whole ranking, not the
 * top of whatever chunk you happen to be looking at.
 */
export function distSlides(d: Distribution): Slide[] {
  const title = distTitle(d)
  if (!isPodium(d) || d.bars.length <= PODIUM_PER_PAGE) {
    return [{ kind: 'dist', label: title, dist: d, crown: podiumHasWinner(d) }]
  }
  const pages: Slide[] = []
  for (let i = 0; i < d.bars.length; i += PODIUM_PER_PAGE) {
    const first = i === 0
    pages.push({
      kind: 'dist',
      label: first ? title : `${title}, continued`,
      dist: {
        ...d,
        // Stamp the absolute place BEFORE slicing. `podiumEntries` falls back to
        // the row's index for a block that does not supply one, which inside a
        // chunk would restart the numbering at #1 on every page.
        bars: d.bars.slice(i, i + PODIUM_PER_PAGE).map((b, n) => ({
          ...b,
          place: b.place ?? `#${i + n + 1}`,
        })),
      },
      crown: first && podiumHasWinner(d),
    })
  }
  return pages
}

/** A podium's bars as WinnerBoard entries. */
export function podiumEntries(d: Distribution) {
  return d.bars.map((b, i) => {
    // A block that can have TIES supplies the place itself, so entries the room
    // placed level share one; otherwise the row's position is the place.
    const place = b.place ?? `#${i + 1}`
    // A bar whose `display` already IS its place (rank) has no separate score to
    // show; one carrying a value (a rating's "8.5") shows both.
    const value = b.display && b.display !== place ? b.display : ''
    return {
      id: `${i}`,
      label: b.label,
      place,
      ...(b.image ? { image: b.image } : {}),
      ...(value ? { value } : {}),
      ...(b.note ? { note: b.note } : {}),
    }
  })
}
