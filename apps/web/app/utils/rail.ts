/**
 * The editor rounds rail's ordering rules, kept pure so they can be unit-tested
 * (there is no component test setup in this repo; see vitest.config.ts).
 *
 * A game's rounds are ONE flat list. A "section" is not a container in the data:
 * it is a run of CONSECUTIVE rounds that share a `group` id, which is what makes
 * `GroupDef` + `RoundInstance.group` renderable as a box. That contiguity is the
 * invariant every move here preserves, because a split run would draw as two
 * boxes with the same name, and the results' `combineRatings` rollup reads the
 * group as one thing.
 *
 * Every move goes through {@link moveRun}, on a RUN of consecutive rounds: a lone
 * round is just a run of one. Three things move as a unit, which is the whole point
 * of this module, a section (grab its header), a two-phase make+judge pair (grab
 * either half; separating them leaves the judge round nothing to build from), and
 * anything else on its own. {@link snapGap} pulls a drop to the nearest gap that
 * splits none of those, and {@link remapRoundRefs} keeps the absolute round indices a
 * config carries pointing at the rounds they meant.
 */

/** The only shape these rules need from a round. */
export interface RailItem {
  group?: string
}

/** One rendered row of the rail: a loose round, or a section box. */
export interface RailRun<T> {
  type: 'loose' | 'section'
  /** The section's group id (absent on a loose round). */
  groupId?: string
  /** Index of the run's first round in the flat rounds list. */
  start: number
  /** How many consecutive rounds the run holds (always 1 for a loose round). */
  count: number
  items: T[]
}

/**
 * Group the flat rounds into rail rows: consecutive same-group rounds become one
 * section run, everything else is a loose row. Mirrors what the rail renders.
 */
export function railRuns<T extends RailItem>(rounds: T[]): Array<RailRun<T>> {
  const rows: Array<RailRun<T>> = []
  rounds.forEach((round, index) => {
    const gid = round.group
    const last = rows[rows.length - 1]
    if (gid && last && last.type === 'section' && last.groupId === gid) {
      last.items.push(round)
      last.count++
      return
    }
    rows.push({
      type: gid ? 'section' : 'loose',
      ...(gid ? { groupId: gid } : {}),
      start: index,
      count: 1,
      items: [round],
    })
  })
  return rows
}

/** The run that contains a given round index (every index is in exactly one). */
export function runAt<T extends RailItem>(rounds: T[], index: number): RailRun<T> | null {
  return railRuns(rounds).find((r) => index >= r.start && index < r.start + r.count) ?? null
}

/**
 * Move `count` consecutive rounds starting at `from` to the insertion gap `gap`,
 * where a gap is an index in the ORIGINAL list (0 = before the first round,
 * `rounds.length` = after the last). Returns a NEW array plus the moved run's new
 * start index, so a caller can keep its selection on the right round.
 *
 * A gap inside the run being moved is a no-op: there is nowhere for a block to
 * land inside itself.
 */
export function moveRun<T>(
  rounds: T[],
  from: number,
  count: number,
  gap: number,
): { rounds: T[]; start: number } {
  const n = rounds.length
  const size = Math.max(1, Math.min(count, n - from))
  if (from < 0 || from >= n) return { rounds: [...rounds], start: from }
  const clampedGap = Math.max(0, Math.min(gap, n))
  // Landing anywhere within the run (or at either of its own edges) changes nothing.
  if (clampedGap >= from && clampedGap <= from + size) return { rounds: [...rounds], start: from }
  const next = [...rounds]
  const moved = next.splice(from, size)
  // Every gap past the run shifts left by the run's length once it is lifted out.
  const dest = clampedGap > from ? clampedGap - size : clampedGap
  next.splice(dest, 0, ...moved)
  return { rounds: next, start: dest }
}

/**
 * Round `index` is glued to the round above it. That is true of a two-phase JUDGE
 * round (Vote, Split, Fib, Draw Vote, Accuse, Photo Vote), whose options are built at
 * play time from the make round it follows: separate the two and the judge round has
 * nothing to build from. The editor supplies this; the rules here stay block-agnostic.
 */
export type BoundToPrev = (index: number) => boolean

export interface GapOptions {
  /** Keep every OTHER section whole (a whole-section drag). A single round may still
   *  land inside a section, since that is how an author joins one. */
  keepSections?: boolean
  /** The moving run's own section, which it is allowed to pass over. */
  ownGroup?: string
  /** Which rounds are glued to the round above them. */
  boundToPrev?: BoundToPrev
  /** Which way to look first when the asked-for gap is not legal. The step arrows
   *  pass their direction, so "move down" past a make+judge pair clears the WHOLE
   *  pair instead of snapping back to where it started and appearing to do nothing.
   *  A drag leaves this unset, so a hover that has not clearly passed something
   *  resolves upward. */
  prefer?: -1 | 1
}

/** Is `gap` a place a run may be inserted without splitting something that must stay
 *  whole? Gaps run 0..rounds.length; `gap` sits immediately before round `gap`. */
function gapIsValid<T extends RailItem>(rounds: T[], gap: number, opts: GapOptions): boolean {
  // Never between a make round and the judge round built from it.
  if (gap > 0 && gap < rounds.length && opts.boundToPrev?.(gap)) return false
  if (!opts.keepSections) return true
  for (const run of railRuns(rounds)) {
    if (run.type !== 'section' || run.groupId === opts.ownGroup) continue
    if (gap > run.start && gap < run.start + run.count) return false
  }
  return true
}

/**
 * Pull an insertion gap to the nearest place a run may actually land: never inside
 * another section (when a whole section is moving), and never between a make round
 * and the judge round derived from it. Ties resolve upward, so a hover that has not
 * clearly passed something does not jump it.
 */
export function snapGap<T extends RailItem>(rounds: T[], gap: number, opts: GapOptions = {}): number {
  const clamped = Math.max(0, Math.min(gap, rounds.length))
  if (gapIsValid(rounds, clamped, opts)) return clamped
  const first = opts.prefer === 1 ? 1 : -1
  for (let d = 1; d <= rounds.length; d++) {
    for (const sign of [first, -first] as const) {
      const at = clamped + sign * d
      if (at >= 0 && at <= rounds.length && gapIsValid(rounds, at, opts)) return at
    }
  }
  return clamped
}

/** What {@link pairedWithPrev} needs from a round on top of {@link RailItem}. */
export interface PairItem extends RailItem {
  block?: string
}

/**
 * Is round `i` the judge half of a two-phase pair whose make half is the round
 * directly above it? A judge round with no explicit `from` builds its options from
 * whatever sits immediately above it at play time, so separating the two silently
 * breaks the pair, and every move here keeps them together.
 *
 * The block check is load-bearing: a real make+judge pair is always two DIFFERENT
 * blocks (quip -> vote, draw -> drawvote), while `isDerived` is per BLOCK. Without
 * it, a game that uses one derived block for both halves (Wavelength alternates a
 * clue round and a guess round of the same block) chains EVERY round into a single
 * run, and reordering that game becomes a no-op in both the arrows and the drag.
 */
export function pairedWithPrev<T extends PairItem>(
  rounds: T[],
  i: number,
  isDerived: (round: T) => boolean,
  sourceIndexFor: (i: number) => number | null,
): boolean {
  const inst = rounds[i]
  const prev = rounds[i - 1]
  if (i <= 0 || !inst || !prev || !isDerived(inst)) return false
  if (inst.block !== undefined && inst.block === prev.block) return false
  return sourceIndexFor(i) === i - 1
}

/**
 * The run of rounds that has to move as ONE when `index` is dragged by itself: a
 * two-phase make+judge pair (in either direction, and through a longer chain), or
 * just that round. Dragging the make round of a Write & Vote and leaving the vote
 * round behind is exactly the "they do not move together" complaint.
 */
export function boundRunAt<T extends RailItem>(
  rounds: T[],
  index: number,
  boundToPrev?: BoundToPrev,
): { start: number; count: number } {
  if (index < 0 || index >= rounds.length) return { start: index, count: 1 }
  if (!boundToPrev) return { start: index, count: 1 }
  let start = index
  while (start > 0 && boundToPrev(start)) start--
  let end = index + 1
  while (end < rounds.length && boundToPrev(end)) end++
  return { start, count: end - start }
}

/**
 * Rewrite the ABSOLUTE round indices a config carries (`from` on a derived round,
 * `fromShares.from` on a round pulling a play-time photo) after a reorder or a
 * removal. Both are plain numbers, so without this a move silently re-points a
 * round at the wrong source and nothing complains. Matches rounds by identity
 * between the two arrays, so it works for a move (same objects, new order) and for
 * a removal (a reference to a gone round is dropped, falling back to the default).
 */
export function remapRoundRefs<T extends RoundRefs>(before: T[], after: T[]): void {
  const moved = new Map<T, number>()
  after.forEach((round, i) => moved.set(round, i))
  const at = (old: number): number | null => {
    const ref = before[old]
    if (!ref) return null
    const next = moved.get(ref)
    return next === undefined ? null : next
  }
  for (const round of after) {
    if (round.from?.length) {
      const mapped = round.from.map(at).filter((x): x is number => x !== null)
      round.from = mapped.length ? mapped : undefined
    }
    const share = round.fromShares
    if (share && typeof share.from === 'number') {
      const next = at(share.from)
      if (next === null) round.fromShares = undefined
      else share.from = next
    }
  }
}

/** The absolute round references {@link remapRoundRefs} keeps honest. */
export interface RoundRefs {
  from?: number[]
  fromShares?: { from?: number } | undefined
}

/**
 * Pull an insertion gap INTO the section a single round was dropped on, so joining a
 * section can never leave the round sitting outside the run it now belongs to (which
 * would draw the section as two boxes). A gap already inside, or on either edge of,
 * that section is kept as-is. With no section (dropping loose) the gap is untouched.
 */
export function clampGapIntoSection<T extends RailItem>(
  rounds: T[],
  gap: number,
  groupId: string | null,
): number {
  const clamped = Math.max(0, Math.min(gap, rounds.length))
  if (!groupId) return clamped
  // A group id CAN appear in more than one run: the round options let an author put a
  // round in a section that is not adjacent to it, which splits the section in two.
  // Clamp into the run NEAREST the drop, not the first one in the list, or a drop at
  // the bottom of the rail would teleport the round up to the other half.
  const runs = railRuns(rounds).filter((x) => x.groupId === groupId)
  if (!runs.length) return clamped
  const distance = (r: RailRun<T>) => {
    const end = r.start + r.count
    return clamped < r.start ? r.start - clamped : clamped > end ? clamped - end : 0
  }
  const run = runs.reduce((best, r) => (distance(r) < distance(best) ? r : best), runs[0] as RailRun<T>)
  const end = run.start + run.count
  return Math.max(run.start, Math.min(clamped, end))
}

/**
 * Settle a moved RUN's section after it stepped a position, so neither its own section
 * nor the one it landed in ends up split across the list:
 *  - dropped between two rounds of the SAME section, the run joins that section;
 *  - carried away from a section it shares with others, it adopts the section it
 *    landed against, or goes loose;
 *  - otherwise (including a lone one-round section) it keeps what it had.
 *
 * The whole run is settled as ONE decision and every round in it gets the same group.
 * Settling each round on its own would give the two halves of a make+judge pair
 * different groups and split a section down the middle. Mutates the rounds, which is
 * what the editor's reactive config wants.
 */
export function settleGroupAt<T extends RailItem>(rounds: T[], at: number, count = 1): void {
  const size = Math.max(1, count)
  const first = rounds[at]
  if (!first) return
  const run = rounds.slice(at, at + size)
  const apply = (group: string | undefined) => {
    for (const r of run) r.group = group
  }
  const prev = rounds[at - 1]?.group
  const next = rounds[at + size]?.group
  // Sitting inside another section: join it, or that section draws as two boxes.
  if (prev && prev === next && prev !== first.group) return apply(prev)
  const own = first.group
  if (!own) return
  if (prev === own || next === own) return // still touching the rest of our section
  // Nothing of our own section adjoins us: only a split if it has other members.
  const strandedFrom = rounds.some((r, i) => (i < at || i >= at + size) && r.group === own)
  if (!strandedFrom) return
  // `undefined` (not `delete`) so the shape stays stable; JSON.stringify drops it.
  apply(prev ?? next ?? undefined)
}

/**
 * The gap that moves a whole rail row one step up or down past its NEIGHBOURING
 * ROW (not one round), so the arrow buttons on a section header step over the
 * next section wholesale instead of burrowing into it. Returns null at the ends.
 */
export function rowStepGap<T extends RailItem>(
  rounds: T[],
  rowIndex: number,
  dir: -1 | 1,
): number | null {
  const rows = railRuns(rounds)
  const row = rows[rowIndex]
  if (!row) return null
  if (dir === -1) {
    const prev = rows[rowIndex - 1]
    return prev ? prev.start : null
  }
  const next = rows[rowIndex + 1]
  return next ? next.start + next.count : null
}
