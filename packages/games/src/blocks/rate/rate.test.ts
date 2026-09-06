import type { BlockResultsContext } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { type RateContent, type RateInput, rateBlock } from './block'

const scale = { kind: 'numeric' as const, min: 1, max: 10, step: 1 }

function content(over: Partial<RateContent> = {}): RateContent {
  return {
    subject: '',
    prompt: 'Rate this',
    image: '',
    timer: null,
    categories: [{ id: 'overall', label: 'Overall' }],
    scale,
    ...over,
  }
}

function ctxFor(
  rounds: Array<{ index: number; content: RateContent; group?: string }>,
  inputs: Record<number, Array<Record<string, number>>>,
  groups?: BlockResultsContext['groups'],
): BlockResultsContext<RateContent, RateInput> {
  return {
    rounds,
    inputsFor: (i) => {
      const m = new Map<string, RateInput>()
      ;(inputs[i] ?? []).forEach((ratings, k) => m.set(`p${k}`, { ratings }))
      return m
    },
    answerFor: () => undefined,
    players: [],
    groups,
  }
}

describe('rate aggregate', () => {
  it('names the top-rated award by the prompt when no subject, and carries the image', () => {
    const c = content({ prompt: 'Rate that pose', image: 'http://x/pic.jpg' })
    const frag = rateBlock.aggregate!(ctxFor([{ index: 0, content: c }], { 0: [{ overall: 8 }, { overall: 10 }] }))
    expect(frag.awards?.[0]?.subject).toBe('Rate that pose')
    expect(frag.awards?.[0]?.image).toBe('http://x/pic.jpg')
    expect(frag.awards?.[0]?.value).toBe('9.0')
  })

  it('shares the top-rated award across every subject tied for the best average', () => {
    const a = content({ subject: 'Hole A', image: 'http://x/a.jpg' })
    const b = content({ subject: 'Hole B', image: 'http://x/b.jpg' })
    const c = content({ subject: 'Hole C' })
    const frag = rateBlock.aggregate!(
      ctxFor(
        [
          { index: 0, content: a },
          { index: 1, content: b },
          { index: 2, content: c },
        ],
        { 0: [{ overall: 8 }, { overall: 8 }], 1: [{ overall: 8 }], 2: [{ overall: 3 }] },
      ),
    )
    // A and B both average 8 (a tie for top); C averages 3 and is not a winner.
    expect(frag.awards?.map((x) => x.subject)).toEqual(['Hole A', 'Hole B'])
    expect(frag.awards?.every((x) => x.value === '8.0')).toBe(true)
    expect(frag.awards?.map((x) => x.image)).toEqual(['http://x/a.jpg', 'http://x/b.jpg'])
  })

  it('keeps a single award when there is a clear winner (no spurious tie)', () => {
    const a = content({ subject: 'Hole A' })
    const b = content({ subject: 'Hole B' })
    const frag = rateBlock.aggregate!(
      ctxFor([{ index: 0, content: a }, { index: 1, content: b }], { 0: [{ overall: 9 }], 1: [{ overall: 4 }] }),
    )
    expect(frag.awards?.map((x) => x.subject)).toEqual(['Hole A'])
  })

  it('prefers an explicit subject over the prompt', () => {
    const c = content({ subject: 'Peach', prompt: 'Rate that pose' })
    const frag = rateBlock.aggregate!(ctxFor([{ index: 0, content: c }], { 0: [{ overall: 7 }] }))
    expect(frag.awards?.[0]?.subject).toBe('Peach')
  })

  it('rolls a combine-ratings group into one ranked distribution, top marked', () => {
    const a = content({ subject: 'Pose A' })
    const b = content({ subject: 'Pose B' })
    const frag = rateBlock.aggregate!(
      ctxFor(
        [
          { index: 0, content: a, group: 'g1' },
          { index: 1, content: b, group: 'g1' },
        ],
        { 0: [{ overall: 4 }], 1: [{ overall: 9 }] },
        [{ id: 'g1', name: 'Best pose', combineRatings: true }],
      ),
    )
    const dist = frag.distributions?.[0]
    expect(dist?.title).toBe('Best pose')
    // Ranked desc: Pose B (9) first and marked, Pose A (4) second.
    expect(dist?.bars.map((x) => x.label)).toEqual(['Pose B', 'Pose A'])
    expect(dist?.bars[0]?.correct).toBe(true)
    expect(dist?.bars[1]?.correct).toBe(false)
  })

  it('does not combine a group that is not flagged', () => {
    const a = content({ subject: 'A' })
    const frag = rateBlock.aggregate!(
      ctxFor([{ index: 0, content: a, group: 'g1' }], { 0: [{ overall: 5 }] }, [{ id: 'g1', name: 'X' }]),
    )
    expect(frag.distributions ?? []).toHaveLength(0)
  })
})

describe('rate results always show what the room rated', () => {
  const round = (subject: string, ratings: number[]) => ({
    subject,
    ratings,
  })
  /** Build an aggregate ctx for N ungrouped rate rounds. */
  function ctxFor(rounds: Array<{ subject: string; ratings: number[] }>) {
    const content = (subject: string) => ({
      ...rateBlock.defaultContent(),
      subject,
      categories: [{ id: 'c1', label: 'Hotness' }],
      scale: { kind: 'numeric' as const, min: 1, max: 10, step: 1 },
    })
    return {
      rounds: rounds.map((r, index) => ({ index, content: content(r.subject) })),
      inputsFor: (i: number) =>
        new Map(rounds[i]!.ratings.map((v, n) => [`p${n}`, { ratings: { c1: v } }])),
      answerFor: () => undefined,
      players: [],
      groups: undefined, // <- no groups: the shape room Z2CP actually ran
    }
  }

  it('ranks every rate round when the author never grouped them', () => {
    // 14 ungrouped rate rounds used to produce a single award card and no
    // ranking at all, so a night of scoring vanished off the results page.
    const frag = rateBlock.aggregate?.(
      ctxFor([round('Low Tide', [7, 7, 6, 7]), round('Unsleep', [6, 6, 7]), round('Soft Night', [5, 5, 5])]) as never,
    )
    const dist = frag?.distributions?.[0]
    expect(dist).toBeDefined()
    expect(dist?.title).toBe('How the room rated them')
    expect(dist?.layout).toBe('podium')
    expect(dist?.bars.map((b) => b.label)).toEqual(['Low Tide', 'Unsleep', 'Soft Night'])
    expect(dist?.bars[0]?.place).toBe('#1')
    expect(dist?.bars[0]?.correct).toBe(true)
  })

  it('still shows the award as well, so the headline result is not lost', () => {
    const frag = rateBlock.aggregate?.(ctxFor([round('A', [9]), round('B', [2])]) as never)
    expect(frag?.awards?.[0]?.label).toBe('Top rated Hotness')
    expect(frag?.awards?.[0]?.subject).toBe('A')
  })

  it('shows nothing rather than a podium of zeroes when nobody rated anything', () => {
    const frag = rateBlock.aggregate?.(ctxFor([round('A', []), round('B', [])]) as never)
    expect(frag?.distributions ?? []).toEqual([])
  })

  it('does not add a fallback when a group already produced a ranking', () => {
    const base = ctxFor([round('A', [9]), round('B', [2])]) as never as {
      rounds: Array<{ index: number; content: unknown; group?: string }>
      groups?: unknown
    }
    for (const r of base.rounds) r.group = 'g1'
    base.groups = [{ id: 'g1', name: 'Season 1', combineRatings: true }]
    const frag = rateBlock.aggregate?.(base as never)
    expect(frag?.distributions?.length).toBe(1)
    expect(frag?.distributions?.[0]?.title).toBe('Season 1')
  })
})
