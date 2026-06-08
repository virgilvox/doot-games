import type { DeriveSource, ScorePlayer } from '@doot-games/sdk'
import { describe, expect, it } from 'vitest'
import { doodleChain } from '../../games/doodle-chain'
import { type DoodleContent, type DoodleRecap, type DoodleSecret, doodleBlock } from './block'

const players: ScorePlayer[] = [
  { id: 'A', name: 'Ada', joinedAtIndex: 0 },
  { id: 'B', name: 'Bo', joinedAtIndex: 0 },
  { id: 'C', name: 'Cy', joinedAtIndex: 0 },
]
const noShuffle = <T,>(x: T[]) => x
const draw = (n: number) => ({ strokes: [{ color: '#000', size: 0.01, points: [0, 0, n, n] }] })

function src(index: number, content: unknown, inputs: Map<string, unknown>): DeriveSource {
  return { index, content, inputs, render: (i) => String((i as { text?: string })?.text ?? '') }
}
const texts = (e: Record<string, string>): Map<string, unknown> =>
  new Map(Object.entries(e).map(([pid, text]) => [pid, { text }]))
const draws = (e: Record<string, number>): Map<string, unknown> =>
  new Map(Object.entries(e).map(([pid, n]) => [pid, draw(n)]))

const base: DoodleContent = { mode: 'draw', prompt: 'go', step: 2, total: 4, seed: false, aspect: 0.7, timer: 60 }

describe('doodle assignContent (the rotation, draw + describe)', () => {
  it('a DRAW round hands each player the left neighbor TEXT to draw', () => {
    const round0 = texts({ A: 'cat', B: 'dog', C: 'fish' })
    const out = doodleBlock.assignContent?.({
      content: { ...base, mode: 'draw' },
      players,
      shuffle: noShuffle,
      sources: [src(0, { seed: true }, round0)], // round 1: from=[0]
    })
    const pp = out?.perPlayer as Record<string, DoodleSecret>
    expect(pp.A?.received.text).toBe('fish') // A <- C
    expect(pp.B?.received.text).toBe('cat')
    expect(pp.C?.received.text).toBe('dog')
    expect(pp.A?.received.strokes).toBeUndefined() // a draw round receives text only
  })

  it('a DESCRIBE round hands each player the left neighbor DRAWING (ring still = seed round)', () => {
    const round0 = texts({ A: 'cat', B: 'dog', C: 'fish' }) // the seed round
    const round1 = draws({ A: 1, B: 2, C: 3 }) // the draw round
    const out = doodleBlock.assignContent?.({
      content: { ...base, mode: 'describe' },
      players,
      shuffle: noShuffle,
      sources: [src(1, { mode: 'draw', seed: false }, round1), src(0, { seed: true }, round0)], // round 2: from=[1,0]
    })
    const pp = out?.perPlayer as Record<string, DoodleSecret>
    // ring = seed (round 0) submitters [A,B,C]; left neighbor reads ROUND 1 drawings.
    expect(pp.A?.received.strokes?.[0]?.points).toEqual([0, 0, 3, 3]) // A <- C's drawing
    expect(pp.B?.received.strokes?.[0]?.points).toEqual([0, 0, 1, 1]) // B <- A
    expect(pp.A?.received.text).toBeUndefined()
  })

  it('the seed round hands out nothing', () => {
    const out = doodleBlock.assignContent?.({ content: { ...base, seed: true, mode: 'describe' }, players, shuffle: noShuffle, sources: [] })
    expect(out?.perPlayer).toEqual({})
  })
})

describe('doodle aggregate (the gallery unspool)', () => {
  it('resolves each step to text or a drawing by that round mode', () => {
    const round0 = texts({ A: 'a0', B: 'b0', C: 'c0' })
    const round1 = draws({ A: 1, B: 2, C: 3 })
    const round2 = texts({ A: 'a2', B: 'b2', C: 'c2' })
    const frag = doodleBlock.aggregate?.({
      rounds: [
        { index: 0, content: { ...base, mode: 'describe', seed: true, step: 1 } },
        { index: 1, content: { ...base, mode: 'draw', step: 2 } },
        { index: 2, content: { ...base, mode: 'describe', step: 3 } },
      ],
      inputsFor: (i) => (i === 0 ? round0 : i === 1 ? round1 : round2) as never,
      answerFor: () => undefined,
      players,
    })
    const recap = frag?.recap as DoodleRecap
    expect(recap.threads).toHaveLength(3)
    // Thread 0 (Ada origin): text a0 -> Bo's drawing (points 0,0,2,2) -> Cy's text c2.
    const t0 = recap.threads[0] ?? []
    expect(t0[0]).toMatchObject({ mode: 'describe', text: 'a0', name: 'Ada' })
    expect(t0[1]?.mode).toBe('draw')
    expect(t0[1]?.drawing?.strokes?.[0]?.points).toEqual([0, 0, 2, 2]) // Bo's drawing
    expect(t0[2]).toMatchObject({ mode: 'describe', text: 'c2', name: 'Cy' })
    expect(frag?.headline).toBe('3 doodle chains unspooled')
  })
})

describe('doodle-chain buildConfig (Drawings -> odd rounds ending on a guess)', () => {
  it('turns N drawings into 1 + 2N rounds, alternating, ending on a describe (guess)', () => {
    const r = doodleChain.buildConfig?.('room', { rounds: 2 })?.rounds ?? [] // 2 drawings
    expect(r).toHaveLength(5)
    const modes = r.map((x) => (x.content as DoodleContent).mode)
    expect(modes).toEqual(['describe', 'draw', 'describe', 'draw', 'describe'])
    expect(modes[modes.length - 1]).toBe('describe') // the payoff: every chain ends on a guess
    expect((r[0]?.content as DoodleContent).seed).toBe(true)
    expect(r[0]?.from).toBeUndefined()
    expect(r[1]?.from).toEqual([0])
    expect(r[2]?.from).toEqual([1, 0])
    expect((r[4]?.content as DoodleContent).total).toBe(5)
  })

  it('always ends on a describe round across the whole supported range', () => {
    for (const drawings of [2, 3, 4, 5]) {
      const r = doodleChain.buildConfig?.('s', { rounds: drawings })?.rounds ?? []
      expect(r).toHaveLength(1 + 2 * drawings)
      expect((r[r.length - 1]?.content as DoodleContent).mode).toBe('describe')
    }
  })

  it('clamps the drawing count to the supported range', () => {
    expect(doodleChain.buildConfig?.('s', { rounds: 99 })?.rounds.length).toBe(11) // 5 drawings
    expect(doodleChain.buildConfig?.('s', { rounds: 1 })?.rounds.length).toBe(5) // 2 drawings
  })
})

describe('doodle emptyInput / isComplete (the mode switch resets cleanly)', () => {
  it('a draw round starts with empty strokes, a describe/seed round with empty text', () => {
    expect(doodleBlock.emptyInput?.({ ...base, mode: 'draw' })).toEqual({ strokes: [] })
    expect(doodleBlock.emptyInput?.({ ...base, mode: 'describe' })).toEqual({ text: '' })
  })
  it('a draw needs strokes to submit; a describe needs text', () => {
    expect(doodleBlock.isComplete?.({ ...base, mode: 'draw' }, { strokes: [] })).toBe(false)
    expect(doodleBlock.isComplete?.({ ...base, mode: 'draw' }, draw(1))).toBe(true)
    expect(doodleBlock.isComplete?.({ ...base, mode: 'describe' }, { text: '  ' })).toBe(false)
    expect(doodleBlock.isComplete?.({ ...base, mode: 'describe' }, { text: 'a cat' })).toBe(true)
  })
})

describe('doodle aggregate edge: an empty drawing carries no thumbnail', () => {
  it('a draw step with no strokes has no drawing, and describe steps never carry one', () => {
    const round0 = texts({ A: 'a0', B: 'b0', C: 'c0' })
    const round1 = new Map<string, unknown>([['A', draw(1)], ['B', { strokes: [] }], ['C', draw(3)]]) // Bo skipped drawing
    const frag = doodleBlock.aggregate?.({
      rounds: [
        { index: 0, content: { ...base, mode: 'describe', seed: true } },
        { index: 1, content: { ...base, mode: 'draw' } },
      ],
      inputsFor: (i) => (i === 0 ? round0 : round1) as never,
      answerFor: () => undefined,
      players,
    })
    const recap = frag?.recap as DoodleRecap
    for (const t of recap.threads) for (const s of t) if (s.mode === 'describe') expect(s.drawing).toBeUndefined()
    const boDraw = recap.threads.flat().find((s) => s.mode === 'draw' && s.name === 'Bo')
    expect(boDraw?.drawing).toBeUndefined() // Bo's empty drawing -> no thumbnail
  })
})
