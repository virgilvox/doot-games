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
