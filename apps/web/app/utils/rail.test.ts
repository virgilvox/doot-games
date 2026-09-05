import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import {
  boundRunAt,
  clampGapIntoSection,
  moveRun,
  pairedWithPrev,
  railRuns,
  remapRoundRefs,
  rowStepGap,
  runAt,
  settleGroupAt,
  snapGap,
} from './rail'

/** A round is only ever `{ id, group? }` as far as the rail rules are concerned. */
type R = { id: string; group?: string }
const r = (id: string, group?: string): R => (group ? { id, group } : { id })
const ids = (rounds: R[]) => rounds.map((x) => x.id)

// a | [b c] (grp1) | d | [e f] (grp2)
const SAMPLE: R[] = [r('a'), r('b', 'g1'), r('c', 'g1'), r('d'), r('e', 'g2'), r('f', 'g2')]

describe('railRuns', () => {
  it('groups consecutive same-group rounds into one section row', () => {
    expect(railRuns(SAMPLE).map((x) => [x.type, x.groupId, x.start, x.count])).toEqual([
      ['loose', undefined, 0, 1],
      ['section', 'g1', 1, 2],
      ['loose', undefined, 3, 1],
      ['section', 'g2', 4, 2],
    ])
  })

  it('splits a NON-consecutive group into two rows (what the invariant protects against)', () => {
    const broken = [r('a', 'g1'), r('b'), r('c', 'g1')]
    expect(railRuns(broken).map((x) => x.count)).toEqual([1, 1, 1])
  })

  it('has a run for every index', () => {
    for (let i = 0; i < SAMPLE.length; i++) expect(runAt(SAMPLE, i)?.items).toContain(SAMPLE[i])
    expect(runAt(SAMPLE, 99)).toBeNull()
  })
})

describe('moveRun: a whole section moves together', () => {
  it('moves a two-round section to the top, keeping its internal order', () => {
    const { rounds, start } = moveRun(SAMPLE, 4, 2, 0) // [e f] to the very front
    expect(ids(rounds)).toEqual(['e', 'f', 'a', 'b', 'c', 'd'])
    expect(start).toBe(0)
    // The section is still ONE contiguous run, so it still renders as one box.
    expect(railRuns(rounds)[0]).toMatchObject({ type: 'section', groupId: 'g2', start: 0, count: 2 })
  })

  it('moves a section down past a later row, accounting for the lift-out shift', () => {
    const { rounds, start } = moveRun(SAMPLE, 1, 2, 4) // [b c] to just before e
    expect(ids(rounds)).toEqual(['a', 'd', 'b', 'c', 'e', 'f'])
    expect(start).toBe(2)
  })

  it('moves a section to the very end', () => {
    const { rounds } = moveRun(SAMPLE, 1, 2, 6)
    expect(ids(rounds)).toEqual(['a', 'd', 'e', 'f', 'b', 'c'])
  })

  it('is a no-op for any gap inside (or on the edge of) the run being moved', () => {
    for (const gap of [1, 2, 3]) {
      expect(ids(moveRun(SAMPLE, 1, 2, gap).rounds)).toEqual(ids(SAMPLE))
      expect(moveRun(SAMPLE, 1, 2, gap).start).toBe(1)
    }
  })

  it('still handles a single round (a run of one), the old drag behaviour', () => {
    expect(ids(moveRun(SAMPLE, 0, 1, 4).rounds)).toEqual(['b', 'c', 'd', 'a', 'e', 'f'])
    expect(ids(moveRun(SAMPLE, 3, 1, 0).rounds)).toEqual(['d', 'a', 'b', 'c', 'e', 'f'])
  })

  it('clamps out-of-range input instead of corrupting the list', () => {
    expect(ids(moveRun(SAMPLE, 1, 2, 99).rounds)).toEqual(['a', 'd', 'e', 'f', 'b', 'c'])
    expect(ids(moveRun(SAMPLE, 1, 2, -5).rounds)).toEqual(['b', 'c', 'a', 'd', 'e', 'f'])
    expect(ids(moveRun(SAMPLE, 9, 2, 0).rounds)).toEqual(ids(SAMPLE))
    // A run that claims more rounds than remain takes only what is there.
    expect(ids(moveRun(SAMPLE, 4, 9, 0).rounds)).toEqual(['e', 'f', 'a', 'b', 'c', 'd'])
  })

  it('never mutates the input list', () => {
    const before = ids(SAMPLE)
    moveRun(SAMPLE, 1, 2, 0)
    expect(ids(SAMPLE)).toEqual(before)
  })
})

describe('snapGap: a drop never splits something that must stay whole', () => {
  const keep = { keepSections: true }

  it('pushes a gap that lands mid-section out to the nearer edge', () => {
    // A three-round section, so "nearer edge" is an actual choice.
    const wide: R[] = [r('a'), r('b', 'g1'), r('c', 'g1'), r('d', 'g1'), r('e')]
    expect(snapGap(wide, 3, keep)).toBe(4) // nearer the section's end
    // A two-round section is equidistant from the middle, and ties resolve upward, so
    // a hover that has not clearly passed the section does not jump it.
    expect(snapGap(SAMPLE, 5, keep)).toBe(4)
    expect(snapGap(SAMPLE, 2, keep)).toBe(1)
  })

  it('leaves gaps that are already between rows alone', () => {
    for (const gap of [0, 1, 3, 4, 6]) expect(snapGap(SAMPLE, gap, keep)).toBe(gap)
  })

  it('ignores the moving run’s OWN section, which may pass over its old slot', () => {
    expect(snapGap(SAMPLE, 5, { ...keep, ownGroup: 'g2' })).toBe(5)
  })

  it('lets a SINGLE round land inside a section (that is how you join one)', () => {
    expect(snapGap(SAMPLE, 5)).toBe(5)
    expect(snapGap(SAMPLE, 2)).toBe(2)
  })

  it('never lands between a make round and the judge round built from it', () => {
    // [quip, vote, poll, quip, vote]: rounds 1 and 4 are glued to the round above.
    const pairs = [r('q1'), r('v1'), r('poll'), r('q2'), r('v2')]
    const bound = (i: number) => i === 1 || i === 4
    expect(snapGap(pairs, 1, { boundToPrev: bound })).toBe(0)
    expect(snapGap(pairs, 4, { boundToPrev: bound })).toBe(3)
    for (const gap of [0, 2, 3, 5]) expect(snapGap(pairs, gap, { boundToPrev: bound })).toBe(gap)
  })

  it('looks the way it is travelling first, so a step down clears the whole pair', () => {
    // [section, quip, vote, poll]: the vote round is glued to the quip above it.
    const rows = [r('sec', 'g1'), r('quip'), r('vote'), r('poll')]
    const bound = (i: number) => i === 2
    // Stepping the section DOWN asks for gap 2, which would split the pair. Without a
    // direction it snaps back to 1 (where it already is) and the button does nothing.
    expect(snapGap(rows, 2, { boundToPrev: bound })).toBe(1)
    expect(snapGap(rows, 2, { boundToPrev: bound, prefer: 1 })).toBe(3)
    // ...and travelling up prefers the gap above.
    expect(snapGap(rows, 2, { boundToPrev: bound, prefer: -1 })).toBe(1)
  })

  it('clamps out-of-range gaps', () => {
    expect(snapGap(SAMPLE, 99, keep)).toBe(6)
    expect(snapGap(SAMPLE, -3, keep)).toBe(0)
  })
})

describe('pairedWithPrev', () => {
  type P = { id: string; block: string; group?: string; from?: number[] }
  const src = (rounds: P[]) => (i: number) => {
    const f = rounds[i]?.from
    const at = f && f.length ? f[f.length - 1]! : i - 1
    return at >= 0 && at < rounds.length ? at : null
  }

  it('binds a real make+judge pair (two different blocks)', () => {
    const rounds: P[] = [{ id: 'q', block: 'quip' }, { id: 'v', block: 'vote' }]
    const derived = (x: P) => x.block === 'vote'
    expect(pairedWithPrev(rounds, 1, derived, src(rounds))).toBe(true)
    expect(pairedWithPrev(rounds, 0, derived, src(rounds))).toBe(false)
  })

  it('does NOT bind two rounds of the SAME derived block, so Wavelength can reorder', () => {
    // Wavelength is one derived block used for every round. Binding on `isDerived`
    // alone chained the whole game into a single run and froze reordering entirely.
    const wave: P[] = [1, 2, 3, 4].map((n) => ({ id: `w${n}`, block: 'wavelength' }))
    const derived = () => true
    expect(wave.map((_, i) => pairedWithPrev(wave, i, derived, src(wave)))).toEqual([
      false,
      false,
      false,
      false,
    ])
    const bound = (i: number) => pairedWithPrev(wave, i, derived, src(wave))
    expect(boundRunAt(wave, 2, bound)).toEqual({ start: 2, count: 1 })
    expect(moveRun(wave, 2, 1, 0).rounds.map((x) => x.id)).toEqual(['w3', 'w1', 'w2', 'w4'])
  })

  it('does not bind a judge round that names a different source round', () => {
    const rounds: P[] = [
      { id: 'q', block: 'quip' },
      { id: 'poll', block: 'poll' },
      { id: 'v', block: 'vote', from: [0] },
    ]
    expect(pairedWithPrev(rounds, 2, (x) => x.block === 'vote', src(rounds))).toBe(false)
  })
})

describe('boundRunAt: a make round and its judge round drag together', () => {
  const pairs = [r('q1'), r('v1'), r('poll'), r('q2'), r('v2')]
  const bound = (i: number) => i === 1 || i === 4

  it('grabs the whole pair from EITHER half', () => {
    expect(boundRunAt(pairs, 0, bound)).toEqual({ start: 0, count: 2 })
    expect(boundRunAt(pairs, 1, bound)).toEqual({ start: 0, count: 2 })
    expect(boundRunAt(pairs, 3, bound)).toEqual({ start: 3, count: 2 })
    expect(boundRunAt(pairs, 4, bound)).toEqual({ start: 3, count: 2 })
  })

  it('leaves a standalone round alone', () => {
    expect(boundRunAt(pairs, 2, bound)).toEqual({ start: 2, count: 1 })
    expect(boundRunAt(pairs, 2)).toEqual({ start: 2, count: 1 })
  })

  it('follows a longer chain of bound rounds', () => {
    const chain = [r('a'), r('b'), r('c'), r('d')]
    expect(boundRunAt(chain, 1, (i) => i === 1 || i === 2)).toEqual({ start: 0, count: 3 })
  })

  it('is safe on an out-of-range index', () => {
    expect(boundRunAt(pairs, 99, bound)).toEqual({ start: 99, count: 1 })
  })

  it('moving the pair keeps them adjacent and in order', () => {
    const { rounds } = moveRun(pairs, 0, 2, 5)
    expect(ids(rounds)).toEqual(['poll', 'q2', 'v2', 'q1', 'v1'])
  })
})

describe('remapRoundRefs: absolute round references survive a reorder', () => {
  type Ref = R & { from?: number[]; fromShares?: { from?: number } }
  const build = (): Ref[] => [
    { id: 'collect' },
    { id: 'quip' },
    { id: 'vote', from: [1] },
    { id: 'rate', fromShares: { from: 0 } },
  ]

  it('follows the rounds a reference points at when the list is reordered', () => {
    const before = build()
    const { rounds: after } = moveRun(before, 3, 1, 0) // the rate round jumps to the top
    remapRoundRefs(before, after)
    expect(ids(after)).toEqual(['rate', 'collect', 'quip', 'vote'])
    expect(after.find((x) => x.id === 'vote')?.from).toEqual([2]) // still the quip round
    expect(after.find((x) => x.id === 'rate')?.fromShares).toEqual({ from: 1 }) // still collect
  })

  it('drops a reference to a round that was removed, falling back to the default', () => {
    const before = build()
    const after = before.filter((x) => x.id !== 'quip' && x.id !== 'collect')
    remapRoundRefs(before, after)
    expect(after.find((x) => x.id === 'vote')?.from).toBeUndefined()
    expect(after.find((x) => x.id === 'rate')?.fromShares).toBeUndefined()
  })

  it('leaves rounds with no references untouched', () => {
    const before = build()
    const { rounds: after } = moveRun(before, 0, 1, 4)
    remapRoundRefs(before, after)
    expect(after.find((x) => x.id === 'quip')?.from).toBeUndefined()
  })
})

describe('rowStepGap: arrow buttons step over a whole neighbouring row', () => {
  it('steps a section up past the loose round above it', () => {
    const gap = rowStepGap(SAMPLE, 1, -1) // the g1 section, up
    expect(gap).toBe(0)
    expect(ids(moveRun(SAMPLE, 1, 2, gap!).rounds)).toEqual(['b', 'c', 'a', 'd', 'e', 'f'])
  })

  it('steps a section down past the ENTIRE next section, not into it', () => {
    const gap = rowStepGap(SAMPLE, 2, 1) // the loose 'd', down past g2
    expect(gap).toBe(6)
    expect(ids(moveRun(SAMPLE, 3, 1, gap!).rounds)).toEqual(['a', 'b', 'c', 'e', 'f', 'd'])
  })

  it('returns null at the ends so the buttons can disable', () => {
    expect(rowStepGap(SAMPLE, 0, -1)).toBeNull()
    expect(rowStepGap(SAMPLE, 3, 1)).toBeNull()
    expect(rowStepGap(SAMPLE, 9, 1)).toBeNull()
  })
})

describe('clampGapIntoSection: joining a section lands you inside it', () => {
  it('pulls a gap outside the target section to its nearest edge', () => {
    expect(clampGapIntoSection(SAMPLE, 0, 'g2')).toBe(4) // above it -> its start
    expect(clampGapIntoSection(SAMPLE, 6, 'g1')).toBe(3) // below it -> its end
  })

  it('leaves a gap that is already in (or on the edge of) the section', () => {
    for (const gap of [1, 2, 3]) expect(clampGapIntoSection(SAMPLE, gap, 'g1')).toBe(gap)
  })

  it('clamps into the NEAREST run when a section id appears twice (a split section)', () => {
    // The round options let an author put a round into a non-adjacent section, which
    // splits it. A drop at the bottom must not teleport the round to the top half.
    const split: R[] = [r('a', 'g'), r('b'), r('c', 'g'), r('d')]
    expect(railRuns(split)).toHaveLength(4)
    expect(clampGapIntoSection(split, 4, 'g')).toBe(3) // nearest run is [c], ends at 3
    expect(clampGapIntoSection(split, 0, 'g')).toBe(0) // nearest run is [a], starts at 0
  })

  it('does not move the gap when dropping loose, or onto an unknown section', () => {
    expect(clampGapIntoSection(SAMPLE, 0, null)).toBe(0)
    expect(clampGapIntoSection(SAMPLE, 5, 'nope')).toBe(5)
  })

  it('would pin a one-round section in place, which is why a SECTION drag skips it', () => {
    // Documents the trap the editor avoids by asking the drag HANDLE (row vs section
    // header) rather than re-deriving intent from the run's shape: clamping a section
    // into "its own" section is a no-op move.
    const solo: R[] = [r('a', 'g1'), r('b'), r('c')]
    expect(clampGapIntoSection(solo, 2, 'g1')).toBe(1) // pulled back to its own slot
    expect(moveRun(solo, 0, 1, 1).rounds.map((x) => x.id)).toEqual(['a', 'b', 'c']) // no-op
    expect(moveRun(solo, 0, 1, 2).rounds.map((x) => x.id)).toEqual(['b', 'a', 'c']) // unclamped
  })
})

describe('settleGroupAt: one-step arrows never split a section', () => {
  it('a round stepping between two rounds of one section joins it', () => {
    const rounds = [r('b', 'g1'), r('a'), r('c', 'g1')] // 'a' was stepped down into g1
    settleGroupAt(rounds, 1)
    expect(rounds[1]!.group).toBe('g1')
    expect(railRuns(rounds)).toHaveLength(1)
  })

  it('a round carried out of its own section adopts where it landed', () => {
    const rounds = [r('a', 'g1'), r('c'), r('b', 'g1')] // 'b' was stepped down past 'c'
    settleGroupAt(rounds, 2)
    expect(rounds[2]!.group).toBeUndefined()
    expect(railRuns(rounds).map((x) => x.count)).toEqual([1, 1, 1])
  })

  it('a LONE one-round section keeps its own name when it moves', () => {
    const rounds = [r('x'), r('a', 'g1')]
    settleGroupAt(rounds, 1)
    expect(rounds[1]!.group).toBe('g1')
  })

  it('two adjacent one-round sections do not swallow each other', () => {
    const rounds = [r('b', 'g2'), r('a', 'g1')]
    settleGroupAt(rounds, 1)
    expect(rounds[1]!.group).toBe('g1')
  })

  it('is a no-op on an out-of-range index', () => {
    const rounds = [...SAMPLE]
    settleGroupAt(rounds, 99)
    expect(ids(rounds)).toEqual(ids(SAMPLE))
  })

  it('settles a whole RUN as one decision, so a pair is never half in a section', () => {
    // A make+judge pair stepped down out of section g1: settling each round on its own
    // would leave the make round adopting g1 (its neighbour above) and the judge round
    // loose, splitting the pair across the section's edge.
    const rounds = [r('a', 'g1'), r('b', 'g1'), r('quip'), r('vote'), r('z')]
    settleGroupAt(rounds, 2, 2)
    expect(rounds.map((x) => x.group)).toEqual(['g1', 'g1', undefined, undefined, undefined])
    expect(railRuns(rounds).map((x) => [x.type, x.count])).toEqual([
      ['section', 2],
      ['loose', 1],
      ['loose', 1],
      ['loose', 1],
    ])
  })

  it('takes a whole run INTO a section it landed inside, both halves together', () => {
    const rounds = [r('a', 'g1'), r('quip'), r('vote'), r('b', 'g1')]
    settleGroupAt(rounds, 1, 2)
    expect(rounds.map((x) => x.group)).toEqual(['g1', 'g1', 'g1', 'g1'])
    expect(railRuns(rounds)).toHaveLength(1)
  })

  it('takes a pair OUT of a section cleanly when it steps past the section edge', () => {
    // [A(G), quip(G), vote(G), D] with the down arrow on the quip: the pair lands after
    // D, and both halves must leave section G together. Settling them one at a time
    // would leave the make round adopting G (nothing else adjoins it) and the judge
    // round loose, splitting the pair AND the section.
    const before = [r('a', 'G'), r('quip', 'G'), r('vote', 'G'), r('d')]
    const { rounds, start } = moveRun(before, 1, 2, 4)
    expect(ids(rounds)).toEqual(['a', 'd', 'quip', 'vote'])
    settleGroupAt(rounds, start, 2)
    expect(rounds.map((x) => x.group)).toEqual(['G', undefined, undefined, undefined])
    expect(railRuns(rounds).map((x) => [x.type, x.count])).toEqual([
      ['section', 1],
      ['loose', 1],
      ['loose', 1],
      ['loose', 1],
    ])
  })

  it('keeps a run inside its own section rather than re-joining it to itself', () => {
    const rounds = [r('a', 'g1'), r('quip', 'g1'), r('vote', 'g1'), r('b', 'g1')]
    settleGroupAt(rounds, 1, 2)
    expect(rounds.every((x) => x.group === 'g1')).toBe(true)
  })
})

describe('remapRoundRefs under Vue reactivity (the config the editor really uses)', () => {
  it('keeps round identity through a reactive config, so references still follow', () => {
    // The editor rounds live on a `reactive()` object and are read back as PROXIES.
    // remapRoundRefs matches rounds by identity, so it only works if the same raw
    // round always yields the SAME proxy across a spread and a whole-array assignment.
    // If Vue ever handed back a different proxy, every `from` would be silently
    // dropped on the first reorder, so pin the behaviour here rather than reason
    // about reactivity internals.
    const config = reactive({
      rounds: [
        { id: 'collect' },
        { id: 'quip' },
        { id: 'vote', from: [1] },
        { id: 'rate', fromShares: { from: 0 } },
      ] as Array<{ id: string; group?: string; from?: number[]; fromShares?: { from?: number } }>,
    })
    const before = [...config.rounds]
    expect(before[0]).toBe(config.rounds[0]) // identity survives the spread

    const { rounds } = moveRun(config.rounds, 3, 1, 0) // the rate round jumps to the top
    config.rounds = rounds
    expect(config.rounds[1]).toBe(before[0]) // ...and the assignment

    remapRoundRefs(before, config.rounds)
    expect(config.rounds.map((r) => r.id)).toEqual(['rate', 'collect', 'quip', 'vote'])
    expect(config.rounds.find((r) => r.id === 'vote')?.from).toEqual([2])
    expect(config.rounds.find((r) => r.id === 'rate')?.fromShares).toEqual({ from: 1 })
  })

  it('drops a reference through a reactive splice (removeRound) instead of re-pointing it', () => {
    const config = reactive({
      rounds: [{ id: 'quip' }, { id: 'vote', from: [0] }, { id: 'poll' }] as Array<{
        id: string
        from?: number[]
      }>,
    })
    const before = [...config.rounds]
    config.rounds.splice(0, 1) // remove the make round the vote round builds on
    remapRoundRefs(before, config.rounds)
    // The source is gone, so the stale index is cleared rather than left pointing at
    // whatever slid into slot 0.
    expect(config.rounds.find((r) => r.id === 'vote')?.from).toBeUndefined()
  })
})
